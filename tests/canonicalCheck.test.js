import { describe, expect, it, vi } from 'vitest'

import {
  calculateDxDistribution,
  calculateScore,
  calculateScoreCanonical,
  planCalculationRanges,
} from '../src/calculation'
import {
  createDistributionResult,
  DISTRIBUTION_RESULT_ERROR_CODES,
  toPublishedBucketDistribution,
  validateDistributionResult,
} from '../src/calculation/DistributionResult'
import {
  calculateScoreCanonical as calculateDataScoreCanonical,
} from '../src/data/ScoreCalculator'
import {
  CalculationRangeError,
  calculationClient,
  createCalculationClient,
} from '../src/application/CalculationClient'
import {
  CHECK_DISPLAY_MODES,
  createCheckRangePolicy,
} from '../src/application/CheckDisplayRequestSnapshot'

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

function createCanonicalScoreEnvelope({
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

function getScorePlan(params, policy) {
  return planCalculationRanges({
    operation: 'score',
    score: params,
  }, policy).scores[0]
}

function getDxDistribution(shihai, dice, critical, options) {
  return calculateDxDistribution({ dice, critical, shihai }, options)
}

function calculateCanonical(params, policy) {
  const plan = getScorePlan(params, policy)
  const envelope = calculateScoreCanonical(
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

function calculateLegacy(params, plan) {
  return calculateScore(
    params,
    { getDxDistribution },
    false,
    plan
  )
}

describe('canonical normal check score producer', () => {
  it('keeps an independently supplied working tail as exact overflow', () => {
    const params = scoreParams({ skill: 2 })
    const provider = vi.fn(() => new Float64Array([0.1, 0.2, 0.3, 0.4]))
    const envelope = calculateScoreCanonical(
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

    expect(() => calculateScoreCanonical(
      scoreParams({ critical: 11 }),
      { getDxDistribution: provider },
      { workingLength: 4, fftLength: 0 }
    )).toThrow('finite canonical score support contains non-zero working tail')
  })

  it('rejects legacy projection when exact overflow may be below bucket 1023', () => {
    const envelope = calculateScoreCanonical(
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

  it('does not allow the data wrapper to fall back to fixed precomputed data', () => {
    expect(() => calculateDataScoreCanonical(
      scoreParams(),
      undefined,
      { workingLength: 4097, fftLength: 0 }
    )).toThrow('requires a runtime distribution provider')
  })

  it('uses the planned working coverage and models the DX tail as exact overflow', () => {
    const params = scoreParams({ skill: -3 })
    const { plan, result } = calculateCanonical(params, {
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

  it('keeps critical 11 finite and applies the skill shift to support', () => {
    const params = scoreParams({
      dice: 2,
      critical: 11,
      skill: -3,
    })
    const { plan, result } = calculateCanonical(params, {
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
    const { plan, result } = calculateCanonical(params)
    const legacy = calculateLegacy(params, plan)
    const projected = toPublishedBucketDistribution(result)

    expect(plan.workingLength).toBe(4173)
    expect(result.values).toHaveLength(plan.workingMax + params.skill + 1)
    expect(result.support).toEqual({ kind: 'infinite' })
    expect(result.overflow.lowerBound)
      .toBe(plan.workingMax + params.skill + 1)
    expect(projected[1023]).toBeCloseTo(legacy.distribution[1023], 8)
  })

  it.each([
    scoreParams({ dice: 0, critical: 11, skill: 9 }),
    scoreParams({ dice: 0, critical: 2, skill: -9, yousei: 4 }),
    scoreParams({ dice: 1, critical: 2, skill: 7, shihai: 2 }),
  ])('represents a proven zero-score finite support for %o', (params) => {
    const { result } = calculateCanonical(params, {
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
      const { plan, result } = calculateCanonical(params)
      const legacy = calculateLegacy(params, plan)
      const projected = toPublishedBucketDistribution(result)

      expect(result.values[0]).toBeGreaterThanOrEqual(
        legacy.failureProbability - 1e-12
      )
      expect(projected).toHaveLength(1024)
      for (let value = 0; value < projected.length; value += 1) {
        expect(projected[value]).toBeCloseTo(legacy.distribution[value], 8)
      }
    }
  })

  it.each([
    scoreParams({ dice: 1, critical: 10, skill: -7 }),
    scoreParams({ dice: 3, critical: 5, skill: 6, yousei: 1 }),
    scoreParams({ dice: 4, critical: 8, skill: 2, shihai: 1 }),
    scoreParams({ dice: 2, critical: 11, skill: 4 }),
  ])('projects to the current published score within migration tolerance for %o', (params) => {
    const { plan, result } = calculateCanonical(params)
    const legacy = calculateLegacy(params, plan)
    const projected = toPublishedBucketDistribution(result)

    let maxAbsoluteDifference = 0
    let l1Difference = 0
    for (let value = 0; value < projected.length; value += 1) {
      const difference = Math.abs(projected[value] - legacy.distribution[value])
      maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference)
      l1Difference += difference
    }

    expect(maxAbsoluteDifference).toBeLessThanOrEqual(2e-6)
    expect(l1Difference).toBeLessThanOrEqual(2e-4)
  })

  it('is exposed through the default CalculationClient with the compatibility summary', async () => {
    const result = await calculationClient.calculateCheckCanonical({
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
    const result = await calculationClient.calculateCheckCanonical(
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

  it('matches the existing calculateCheck summary for a fixed finite fixture', async () => {
    const params = {
      action: scoreParams({ dice: 0, critical: 11, skill: 8 }),
      reaction: scoreParams({ dice: 0, critical: 11, skill: 3 }),
    }
    const difficulty = { opposed: true, target: 0 }

    const legacy = await calculationClient.calculateCheck(params, difficulty)
    const canonical = await calculationClient.calculateCheckCanonical(
      params,
      difficulty
    )

    expect(canonical.scoreSummary).toEqual(legacy.scoreSummary)
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
    calculateScore: vi.fn(),
    calculateScoreCanonical: vi.fn(() => createCanonicalScoreEnvelope()),
    calculateDxDistribution: vi.fn(),
    getScore: vi.fn(),
    getScoreSummary: vi.fn(),
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

    const resultPromise = client.calculateCheckCanonical(
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
    expect(dependencies.calculateScoreCanonical).toHaveBeenNthCalledWith(
      1,
      scoreParams({ skill: 2 }),
      expect.any(Function),
      dependencies.plan.scores[0]
    )
    expect(dependencies.calculateScoreCanonical).toHaveBeenNthCalledWith(
      2,
      scoreParams({ skill: -1 }),
      expect.any(Function),
      dependencies.plan.scores[1]
    )
    expect(dependencies.getScoreSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          distribution: expect.any(Float64Array),
          upperTailProbability: expect.any(Array),
          failureProbability: 0,
        }),
        reaction: expect.objectContaining({
          distribution: expect.any(Float64Array),
          upperTailProbability: expect.any(Array),
          failureProbability: 0,
        }),
      }),
      { opposed: true, target: 0 }
    )
    expect(dependencies.calculateScore).not.toHaveBeenCalled()
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

    await expect(client.calculateCheckCanonical(
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
    expect(dependencies.calculateScoreCanonical).not.toHaveBeenCalled()
  })

  it('projects safe exact overflow into the summary compatibility shape', async () => {
    const safeEnvelope = createCanonicalScoreEnvelope({
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
    const dependencies = createClientDependencies({
      calculateScoreCanonical: vi.fn(() => safeEnvelope),
    })
    const client = createCalculationClient(dependencies)

    const result = await client.calculateCheckCanonical(
      checkParams(),
      { opposed: false, target: 0 }
    )
    const summaryScore = dependencies.getScoreSummary.mock.calls[0][0]

    expect(result.score.action).toBe(safeEnvelope)
    expect(summaryScore.action.distribution[0]).toBeCloseTo(0.4, 12)
    expect(summaryScore.action.distribution[1023]).toBeCloseTo(0.6, 12)
    expect(summaryScore.action.failureProbability).toBe(0.25)
    expect(summaryScore.action.upperTailProbability[1023]).toBeCloseTo(0.6, 12)
    expect(dependencies.calculateScore).not.toHaveBeenCalled()
  })

  it.each([
    {
      kind: 'upper-bound',
      lowerBound: 1023,
      probabilityUpperBound: 0.6,
      errorBound: 0,
      code: DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_PROJECTION,
    },
    {
      kind: 'exact',
      lowerBound: 1000,
      probability: 0.6,
      errorBound: 0,
      code: DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION,
    },
  ])('rejects an unsafe canonical projection: $kind', async (overflow) => {
    const unsafeEnvelope = createCanonicalScoreEnvelope({
      values: [0.4],
      support: { kind: 'infinite' },
      overflow,
    })
    const dependencies = createClientDependencies({
      calculateScoreCanonical: vi.fn(() => unsafeEnvelope),
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateCheckCanonical(
      checkParams(),
      { opposed: true, target: 0 }
    )).rejects.toMatchObject({ code: overflow.code })
    expect(dependencies.getScoreSummary).not.toHaveBeenCalled()
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

    await expect(client.calculateCheckCanonical(
      checkParams(),
      { opposed: true, target: 0 },
      { signal: controller.signal }
    )).rejects.toMatchObject({ name: 'AbortError' })
    expect(dependencies.calculateScoreCanonical).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases the lease when canonical score production aborts or fails', async () => {
    const release = vi.fn()
    const controller = new AbortController()
    const canonicalError = new Error('canonical score failure')
    const dependencies = createClientDependencies({
      resourceGuard: {
        acquirePlan: vi.fn(() => ({ release })),
      },
      calculateScoreCanonical: vi.fn(() => {
        controller.abort()
        throw canonicalError
      }),
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateCheckCanonical(
      checkParams(),
      { opposed: true, target: 0 },
      { signal: controller.signal }
    )).rejects.toBe(canonicalError)
    expect(release).toHaveBeenCalledOnce()
  })
})
