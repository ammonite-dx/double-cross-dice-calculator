import { describe, expect, it, vi } from 'vitest'

import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  calculateScore,
  getScoreSummary,
} from '../src/calculation/ScoreCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  createDistributionResult,
  DISTRIBUTION_RESULT_ERROR_CODES,
  toPublishedBucketDistribution,
  validateDistributionResult,
} from '../src/calculation/DistributionResult'
import {
  CalculationRangeError,
  calculationClient,
  createCalculationClient,
} from '../src/runtime/CalculationClient'
import {
  CHECK_DISPLAY_MODES,
} from '../src/features/check/model/CheckDisplayRequestSnapshot'
import { createCheckRangePolicy } from '../src/runtime/CheckRangePolicy'

function scoreParams(overrides = {}) {
  return {
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
    ...overrides,
  }
}

function createScoreEnvelope({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: 0 },
  overflow = null,
  failureProbability = 0,
} = {}) {
  return Object.freeze({
    result: createDistributionResult({ values, offset, support, overflow }),
    metadata: Object.freeze({ modeledDistribution: true, failureProbability }),
  })
}

function createScoreSummary() {
  return {
    action: {
      expectedValue: { kind: 'exact', value: 0 },
      successRate: { kind: 'exact', value: 0 },
    },
    reaction: {
      expectedValue: { kind: 'exact', value: 0 },
      successRate: { kind: 'exact', value: 0 },
    },
  }
}

function getScorePlan(params, policy) {
  return planCalculationRanges({
    operation: 'score',
    score: params,
  }, policy).scores[0]
}

function getDxDistribution(shihai, dice, critical, options, yousei = 0) {
  return calculateDxDistribution({ dice, critical, shihai, yousei }, options)
}

function calculate(params, policy) {
  const plan = getScorePlan(params, policy)
  const envelope = calculateScore(
    params,
    { getDxDistribution },
    plan
  )
  return {
    plan,
    envelope,
    result: envelope.result,
  }
}

function oneDieTailReference(value, critical) {
  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical; face += 1) {
    const firstExcludedRepeat = value < face
      ? 0
      : Math.floor((value - face) / 10) + 1
    if (criticalProbability === 0) {
      if (firstExcludedRepeat === 0) {
        result += 0.1
      }
      continue
    }
    result += 0.1 * criticalProbability ** firstExcludedRepeat /
      (1 - criticalProbability)
  }
  return Math.max(0, Math.min(1, result))
}

function maxTailReference(value, dice, critical) {
  const oneDieTail = oneDieTailReference(value, critical)
  if (oneDieTail === 1) {
    return 1
  }
  return Math.max(0, Math.min(
    1,
    -Math.expm1(dice * Math.log1p(-oneDieTail))
  ))
}

function expectedMaxReference(dice, critical, cutoff = 20000) {
  let expectedValue = 0
  for (let value = 0; value <= cutoff; value += 1) {
    expectedValue += maxTailReference(value, dice, critical)
  }
  return expectedValue
}

describe('canonical normal check score producer', () => {
  it('keeps a large fixed score as a sparse canonical point mass', () => {
    const fixedScore = 10_000
    const envelope = calculateScore(
      scoreParams({ skill: fixedScore }),
      { getDxDistribution: vi.fn() },
      { workingLength: 4, fftLength: 0 },
      true
    )

    expect(envelope.result.offset).toBe(fixedScore)
    expect(envelope.result.values).toEqual(new Float64Array([1]))
    expect(envelope.result.support).toEqual({
      kind: 'finite',
      max: fixedScore,
    })
    expect(envelope.result.overflow).toBeNull()
    expect(envelope.metadata.failureProbability).toBe(0)
    expect(envelope.metadata.modeledDistribution).toBe(true)
  })

  it('keeps an independently supplied working tail as exact overflow', () => {
    const params = scoreParams({ skill: 2 })
    const provider = vi.fn(() => new Float64Array([0.1, 0.2, 0.3, 0.4]))
    const envelope = calculateScore(
      params,
      { getDxDistribution: provider },
      { workingLength: 4, fftLength: 0 }
    )
    const result = envelope.result

    expect(provider).toHaveBeenCalledWith(
      params.shihai,
      params.dice,
      params.critical,
      { workingLength: 4, rounding: 'unrounded' }
    )
    expect(result.offset).toBe(0)
    expect(result.support).toEqual({ kind: 'infinite' })
    expect(result.values).toHaveLength(5)
    expect(result.values[0]).toBeCloseTo(0.3, 12)
    expect(result.values[1]).toBe(0)
    expect(result.values[2]).toBe(0)
    expect(result.values[3]).toBe(0)
    expect(result.values[4]).toBeCloseTo(0.3, 12)
    expect(result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 5,
      probability: 0.4,
      errorBound: expect.any(Number),
    })
    expect(validateDistributionResult(result)).toBe(true)
    expect(envelope.metadata.modeledDistribution).toBe(true)
    expect(envelope.metadata.failureProbability).toBeCloseTo(0.3, 12)
    expect(Object.isFrozen(envelope)).toBe(true)
    expect(Object.isFrozen(envelope.metadata)).toBe(true)
  })

  it('rejects non-negligible working tail when support is proven finite', () => {
    const provider = vi.fn(() => new Float64Array([0.1, 0.2, 0.3, 0.4]))

    expect(() => calculateScore(
      scoreParams({ critical: 11 }),
      { getDxDistribution: provider },
      { workingLength: 4, fftLength: 0 }
    )).toThrow('finite score support contains non-zero working tail')
  })

  it('rejects legacy projection when exact overflow may be below bucket 1023', () => {
    const envelope = calculateScore(
      scoreParams({ skill: 2 }),
      { getDxDistribution: () => new Float64Array([0.1, 0.2, 0.3, 0.4]) },
      { workingLength: 4, fftLength: 0 }
    )

    let error
    try {
      toPublishedBucketDistribution(envelope.result)
    } catch (caught) {
      error = caught
    }
    expect(error?.code).toBe(
      DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION
    )
  })

  it('requires an explicit runtime distribution provider', () => {
    expect(() => calculateScore(
      scoreParams(),
      {},
      { workingLength: 4097, fftLength: 0 }
    )).toThrow('getDxDistribution is not a function')
  })

  it('uses the planned working coverage and models the DX tail as exact overflow', () => {
    const params = scoreParams({ skill: -3 })
    const { plan, result } = calculate(params, {
      calculationMax: 0,
      display: { defaultMax: 0 },
    })

    expect(validateDistributionResult(result)).toBe(true)
    expect(result.offset).toBe(0)
    expect(result.support).toEqual({ kind: 'infinite' })
    expect(result.values).toHaveLength(plan.workingMax + params.skill + 1)
    expect(result.overflow).toEqual(expect.objectContaining({
      kind: 'exact',
      lowerBound: plan.workingMax + 1 + params.skill,
    }))
    expect(result.overflow.probability).toBeGreaterThan(0)
    expect(result.overflow.probability).toBeLessThanOrEqual(
      plan.tail.bound + 1e-12
    )
    expect(result.values[0]).toBeGreaterThan(0)
  })

  it('certifies the default two-sided DX expectation and success intervals', () => {
    const action = calculate(scoreParams())
    const reaction = calculate(scoreParams())
    const summary = getScoreSummary({
      action: action.envelope,
      reaction: reaction.envelope,
    })

    expect(action.envelope.metadata.scoreExpectationCertificate).toEqual(
      expect.objectContaining({
        kind: 'score-expectation-certificate',
        modeledMax: action.plan.workingMax,
      })
    )
    expect(Object.isFrozen(
      action.envelope.metadata.scoreExpectationCertificate
    )).toBe(true)
    expect(Object.isFrozen(
      action.envelope.metadata.scoreTailCertificate
    )).toBe(true)
    const actionTailCertificate =
      action.envelope.metadata.scoreTailCertificate
    const explicitMass = Array.from(action.envelope.result.values)
      .reduce((sum, probability) => sum + probability, 0)
    const omittedMass = 1 - explicitMass
    expect(omittedMass).toBeGreaterThanOrEqual(
      actionTailCertificate.massLowerBound - 1e-12
    )
    expect(omittedMass).toBeLessThanOrEqual(
      actionTailCertificate.massUpperBound + 1e-12
    )
    expect(summary.action.expectedValue.kind).toBe('bounded')
    expect(summary.action.expectedValue.lowerBound)
      .toBeLessThanOrEqual(6.0111111112)
    expect(summary.action.expectedValue.upperBound)
      .toBeGreaterThanOrEqual(6.0111111110)
    expect(summary.action.successRate.kind).toBe('bounded')
    expect(summary.action.successRate.lowerBound)
      .toBeLessThanOrEqual(45.45454546)
    expect(summary.action.successRate.upperBound)
      .toBeGreaterThanOrEqual(45.45454544)
    expect(summary.reaction.successRate.lowerBound)
      .toBeLessThanOrEqual(54.54545456)
    expect(summary.reaction.successRate.upperBound)
      .toBeGreaterThanOrEqual(54.54545454)
  })

  it('keeps unsupported infinite score expectation summaries unavailable', () => {
    for (const params of [
      scoreParams({ skill: -1 }),
      scoreParams({ dice: 2, critical: 2, shihai: 1 }),
      scoreParams({ yousei: 1 }),
    ]) {
      const calculated = calculate(params)
      const summary = getScoreSummary({
        action: calculated.envelope,
        reaction: calculated.envelope,
      })

      expect(summary.action.expectedValue.kind, JSON.stringify(params))
        .toBe('lower-bound')
      expect(calculated.envelope.metadata)
        .not.toHaveProperty('scoreExpectationCertificate')
    }
  })

  it('keeps high-dice expectation certificates around a closed-form reference', () => {
    const params = scoreParams({ dice: 99, critical: 2 })
    const { plan, envelope } = calculate(params)
    const certificate = envelope.metadata.scoreExpectationCertificate
    const reference = expectedMaxReference(params.dice, params.critical)

    expect(plan.workingMax).toBeGreaterThan(1000)
    expect(certificate.lowerBound).toBeLessThanOrEqual(reference)
    expect(certificate.upperBound).toBeGreaterThanOrEqual(reference)
    expect(certificate.tailEvaluationErrorBound)
      .toBeGreaterThanOrEqual((plan.workingMax + 1) * 1e-8)
  })

  it('keeps exact tail mass and isolates expectation from DP bucket drift', () => {
    const params = scoreParams()
    const provider = () => new Float64Array([0.1, 0.1, 0.2, 0.6])
    const basePlan = {
      workingLength: 4,
      fftLength: 0,
      tail: { model: 'exact-max', bound: 0.600000005 },
    }
    const envelope = calculateScore(
      params,
      { getDxDistribution: provider },
      basePlan
    )
    const certificate = envelope.metadata.scoreTailCertificate
    expect(certificate.massLowerBound).toBeCloseTo(0.6, 12)
    expect(certificate.massUpperBound).toBeCloseTo(0.6, 12)
    const expectation = envelope.metadata.scoreExpectationCertificate
    expect(expectation).toEqual(expect.objectContaining({
      model: 'dx-max-tail',
    }))

    const contradictory = calculateScore(
      params,
      { getDxDistribution: provider },
      {
        ...basePlan,
        tail: { model: 'exact-max', bound: 0.5 },
      }
    )
    expect(contradictory.metadata.scoreTailCertificate).toBeNull()
    expect(contradictory.metadata.scoreExpectationCertificate)
      .toEqual(expectation)
  })

  it('uses the planner bound for zero stored tail with diagnostic error', () => {
    const params = scoreParams()
    const envelope = calculateScore(
      params,
      { getDxDistribution: () => new Float64Array([0.1, 0.9, 0]) },
      {
        workingLength: 3,
        fftLength: 0,
        tail: { model: 'exact-max', bound: 0.25 },
      }
    )

    expect(envelope.result.overflow).toEqual(expect.objectContaining({
      probability: 0,
      errorBound: 1e-8,
    }))
    expect(envelope.metadata.scoreTailCertificate).toEqual(
      expect.objectContaining({
        massLowerBound: 0,
        massUpperBound: 0.25,
      })
    )
  })

  it('keeps critical 11 finite and applies the skill shift to support', () => {
    const params = scoreParams({
      dice: 2,
      critical: 11,
      skill: -3,
    })
    const { plan, result } = calculate(params, {
      calculationMax: 0,
      display: { defaultMax: 0 },
    })

    expect(plan.finiteSupport).toBe(false)
    expect(result.support).toEqual({ kind: 'finite', max: 7 })
    expect(result.values).toHaveLength(8)
    expect(result.overflow).toBeNull()
    expect(result.values[0]).toBeGreaterThan(0)
    expect(Array.from(result.values).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 10)
  })

  it('passes the planned long working length through yousei convolution', () => {
    const params = scoreParams({
      dice: 99,
      critical: 2,
      skill: -7,
      yousei: 9,
    })
    const { plan, result } = calculate(params)
    expect(plan.workingLength).toBe(4173)
    expect(result.values).toHaveLength(plan.workingMax + params.skill + 1)
    expect(result.support).toEqual({ kind: 'infinite' })
    expect(result.overflow.lowerBound)
      .toBe(plan.workingMax + params.skill + 1)
  })

  it.each([
    scoreParams({ dice: 0, critical: 11, skill: 9 }),
    scoreParams({ dice: 0, critical: 2, skill: -9, yousei: 4 }),
    scoreParams({ dice: 1, critical: 2, skill: 7, shihai: 2 }),
  ])('represents a proven zero-score finite support for %o', (params) => {
    const { result } = calculate(params, {
      calculationMax: 0,
      display: { defaultMax: 0 },
    })

    expect(result.offset).toBe(0)
    expect(result.values).toEqual(new Float64Array([1]))
    expect(result.support).toEqual({ kind: 'finite', max: 0 })
    expect(result.overflow).toBeNull()
  })

  it('keeps fumble and both signs of skill in the canonical score coordinate', () => {
    for (const skill of [-7, 7]) {
      const params = scoreParams({ skill })
      const { result } = calculate(params)

      expect(result.values[0]).toBeGreaterThanOrEqual(0)
      expect(result.values.length).toBeGreaterThan(0)
    }
  })

  it('is exposed through the default CalculationClient with a canonical summary', async () => {
    const result = await calculationClient.calculateCheck({
      action: scoreParams({ skill: 2 }),
      reaction: scoreParams({ skill: -1 }),
    }, { opposed: true, target: 0 })

    expect(validateDistributionResult(result.score.action.result)).toBe(true)
    expect(validateDistributionResult(result.score.reaction.result)).toBe(true)
    expect(result.score.action.metadata.modeledDistribution).toBe(true)
    expect(result.score.reaction.metadata.modeledDistribution).toBe(true)
    expect(result).toHaveProperty('scoreSummary')
  })

  it('extends canonical Check score coverage beyond the legacy display range', async () => {
    const displayRequest = { min: 0, max: 1200, mode: CHECK_DISPLAY_MODES.PMF }
    const result = await calculationClient.calculateCheck(
      {
        action: scoreParams(),
        reaction: scoreParams(),
      },
      { opposed: true, target: 0 },
      {
        displayRequest,
        rangePolicy: createCheckRangePolicy(displayRequest),
      }
    )

    expect(result.score.action.result.values.length).toBeGreaterThan(1200)
    expect(result.score.reaction.result.values.length).toBeGreaterThan(1200)
  })

})

function createClientDependencies(overrides = {}) {
  const plan = {
    accepted: true,
    operation: 'check',
    scores: [{ id: 'action' }, { id: 'reaction' }],
    estimates: {
      float64Bytes: 64,
      operations: 10,
      timeMs: 1,
    },
  }
  const resourceGuard = {
    acquirePlan: vi.fn(() => ({ release: vi.fn() })),
  }
  return {
    calculateScore: vi.fn(() => createScoreEnvelope()),
    calculateDxDistribution: vi.fn(),
    getScoreSummary: vi.fn(() => createScoreSummary()),
    planCalculationRanges: vi.fn(() => plan),
    resourceGuard,
    ...overrides,
    plan,
  }
}

function checkParams() {
  return {
    action: scoreParams({ skill: 2 }),
    reaction: scoreParams({ skill: -1 }),
  }
}

describe('CalculationClient canonical normal check API', () => {
  it('snapshots input, publishes preflight, and uses a resource lease', async () => {
    const dependencies = createClientDependencies()
    const client = createCalculationClient(dependencies)
    const onRangePlan = vi.fn()
    const signal = new AbortController().signal
    const options = {
      signal,
      requestId: 'canonical-check-1',
      rangePolicy: { calculationMax: 12 },
      onRangePlan,
    }
    const params = checkParams()
    const difficulty = { opposed: true, target: 0 }

    const resultPromise = client.calculateCheck(
      params,
      difficulty,
      options
    )
    params.action.dice = 99
    params.reaction.skill = 99
    difficulty.target = 99
    const result = await resultPromise

    expect(result.score.action.metadata.modeledDistribution).toBe(true)
    expect(result.score.reaction.metadata.modeledDistribution).toBe(true)
    expect(dependencies.planCalculationRanges).toHaveBeenCalledWith({
      operation: 'check',
      score: {
        action: scoreParams({ skill: 2 }),
        reaction: scoreParams({ skill: -1 }),
      },
    }, options.rangePolicy)
    expect(onRangePlan).toHaveBeenCalledWith(dependencies.plan)
    expect(dependencies.calculateScore).toHaveBeenNthCalledWith(
      1,
      scoreParams({ skill: 2 }),
      expect.any(Function),
      dependencies.plan.scores[0]
    )
    expect(dependencies.calculateScore).toHaveBeenNthCalledWith(
      2,
      scoreParams({ skill: -1 }),
      expect.any(Function),
      dependencies.plan.scores[1]
    )
    expect(dependencies.getScoreSummary).toHaveBeenCalledWith(
      result.score,
      { opposed: true, target: 0 }
    )
    expect(dependencies.resourceGuard.acquirePlan).toHaveBeenCalledWith(
      dependencies.plan,
      { signal, requestId: 'canonical-check-1', operation: 'check' }
    )
    expect(dependencies.resourceGuard.acquirePlan.mock.results[0].value.release)
      .toHaveBeenCalledOnce()
  })

  it('rejects before score production on a range preflight failure', async () => {
    const plan = {
      accepted: false,
      operation: 'check',
      rejectionReasons: ['estimated-memory'],
    }
    const dependencies = createClientDependencies({
      planCalculationRanges: vi.fn(() => plan),
    })
    const client = createCalculationClient(dependencies)
    const onRangePlan = vi.fn()

    await expect(client.calculateCheck(
      checkParams(),
      { opposed: true, target: 0 },
      { onRangePlan }
    )).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(CalculationRangeError)
      expect(error.plan).toBe(plan)
      return true
    })
    expect(onRangePlan).toHaveBeenCalledWith(plan)
    expect(dependencies.resourceGuard.acquirePlan).not.toHaveBeenCalled()
    expect(dependencies.calculateScore).not.toHaveBeenCalled()
  })

  it('passes canonical envelopes to the typed summary without published projection', async () => {
    const safeEnvelope = createScoreEnvelope({
      values: [0.4],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 1023,
        probability: 0.6,
        errorBound: 0,
      },
      failureProbability: 0.25,
    })
    const Summary = createScoreSummary()
    const dependencies = createClientDependencies({
      calculateScore: vi.fn(() => safeEnvelope),
      getScoreSummary: vi.fn(() => Summary),
    })
    const client = createCalculationClient(dependencies)

    const result = await client.calculateCheck(
      checkParams(),
      { opposed: false, target: 0 }
    )
    expect(result.score.action).toBe(safeEnvelope)
    expect(result.scoreSummary).toBe(Summary)
    expect(dependencies.getScoreSummary).toHaveBeenCalledWith(
      { action: safeEnvelope, reaction: safeEnvelope },
      { opposed: false, target: 0 }
    )
  })

  it.each([
    {
      kind: 'upper-bound',
      lowerBound: 1023,
      probabilityUpperBound: 0.6,
      errorBound: 0,
    },
    {
      kind: 'exact',
      lowerBound: 1000,
      probability: 0.6,
      errorBound: 0,
    },
  ])('keeps non-projectable canonical overflow in the typed summary path: $kind', async (overflow) => {
    const unsafeEnvelope = createScoreEnvelope({
      values: [0.4],
      support: { kind: 'infinite' },
      overflow,
    })
    const Summary = createScoreSummary()
    const dependencies = createClientDependencies({
      calculateScore: vi.fn(() => unsafeEnvelope),
      getScoreSummary: vi.fn(() => Summary),
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateCheck(
      checkParams(),
      { opposed: true, target: 0 }
    )).resolves.toMatchObject({ scoreSummary: Summary })
    expect(dependencies.getScoreSummary).toHaveBeenCalledOnce()
  })

  it('aborts after admission and always releases the lease', async () => {
    const controller = new AbortController()
    const release = vi.fn()
    const dependencies = createClientDependencies({
      resourceGuard: {
        acquirePlan: vi.fn(() => {
          controller.abort()
          return { release }
        }),
      },
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateCheck(
      checkParams(),
      { opposed: true, target: 0 },
      { signal: controller.signal }
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(dependencies.calculateScore).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases the lease when canonical score production aborts or fails', async () => {
    const release = vi.fn()
    const controller = new AbortController()
    const failure = new Error('canonical score failure')
    const dependencies = createClientDependencies({
      resourceGuard: {
        acquirePlan: vi.fn(() => ({ release })),
      },
      calculateScore: vi.fn(() => {
        controller.abort()
        throw failure
      }),
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateCheck(
      checkParams(),
      { opposed: true, target: 0 },
      { signal: controller.signal }
    )).rejects.toBe(failure)
    expect(release).toHaveBeenCalledOnce()
  })
})
