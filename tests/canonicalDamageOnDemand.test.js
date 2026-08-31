import { describe, expect, it, vi } from 'vitest'

import { calculateCanonicalDamageOnDemand } from '../src/calculation/DamageCalculator'
import { createDistributionResult } from '../src/calculation/DistributionResult'

function scoreWithHitProbability(hitProbability) {
  return {
    action: canonicalScoreEnvelope([[1, 1]]),
    reaction: canonicalScoreEnvelope([
      [0, hitProbability],
      [2, 1 - hitProbability],
    ]),
  }
}

function createRangePlan(attack, defence, overrides = {}, propagation = 'published-bucket') {
  const fixedDifference = attack.value - defence.value
  const workingMax = fixedDifference >= 0 ? 10 + fixedDifference : 10
  const damage = {
    fixedDifference,
    rawSupportMax: 10,
    rawMax: 10,
    workingMax,
    workingLength: workingMax + 2,
    defenceMax: defence.dice * 10,
    fftLength: 16,
    defenceFftLength: defence.dice > 0 ? 32 : 0,
    scoreValueMode: propagation,
    ...overrides,
  }
  return {
    accepted: true,
    operation: 'attack',
    propagation: { score: propagation },
    scores: [
      { tail: { kind: 'dx-tail', bound: 2e-9, modeledMax: 20 } },
      { tail: { kind: 'dx-tail', bound: 3e-9, modeledMax: 30 } },
    ],
    damage,
  }
}

function pointProvider(rawValue, observedTotals = [], observedWeights = []) {
  return vi.fn(async (weights, _kazanari, options) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    observedTotals.push(total)
    observedWeights.push(weights.slice())
    const distribution = new Float64Array(options.distributionLength)
    if (total > 0) {
      distribution[Math.min(rawValue, distribution.length - 1)] = total
    }
    return distribution
  })
}

function canonicalScoreEnvelope(
  entries,
  {
    support = { kind: 'finite', max: Math.max(...entries.map(([value]) => value)) },
    overflow = null,
    metadata = {},
  } = {}
) {
  const maxValue = Math.max(...entries.map(([value]) => value))
  const values = new Float64Array(maxValue + 1)
  for (const [value, probability] of entries) {
    values[value] = probability
  }
  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support,
      overflow,
    }),
    metadata: {
      modeledDistribution: true,
      ...metadata,
    },
  }
}

function weightedRawProvider(entries) {
  return vi.fn(async (weights, _kazanari, options) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const distribution = new Float64Array(options.distributionLength)
    for (const [rawValue, share] of entries) {
      distribution[rawValue] = total * share
    }
    return distribution
  })
}

function deterministicDefence(value) {
  const distribution = Array(11).fill(0)
  distribution[value] = 1
  return distribution
}

const noDefence = { dice: 0, value: 0 }

describe('canonical on-demand damage calculation', () => {
  it.each([0, 0.5, 1])(
    'keeps a DR hit mass of %s as a sub-probability until failure composition',
    async (hitProbability) => {
      const attack = { dice: 0, value: 0, kazanari: 0 }
      const observedTotals = []
      const provider = pointProvider(2, observedTotals)
      const canonical = await calculateCanonicalDamageOnDemand(
        scoreWithHitProbability(hitProbability),
        attack,
        noDefence,
        { getDamageRollDistribution: provider },
        {},
        createRangePlan(attack, noDefence)
      )

      expect(observedTotals).toEqual([hitProbability])
      expect(canonical.result.values[0]).toBeCloseTo(1 - hitProbability, 12)
      expect(canonical.result.values[2]).toBeCloseTo(hitProbability, 12)
      expect(canonical.result.overflow).toBeNull()
      expect(provider).toHaveBeenCalledOnce()
    }
  )

  it('passes runtime options, including the cancellation signal, to defence D10', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 1, value: 0 }
    const controller = new AbortController()
    const getD10Distribution = vi.fn(() => deterministicDefence(0))

    await calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      defence,
      {
        getDamageRollDistribution: pointProvider(2),
        getD10Distribution,
      },
      { signal: controller.signal, requestId: 'defence-d10-signal' },
      createRangePlan(attack, defence)
    )

    expect(getD10Distribution).toHaveBeenCalledWith(
      defence.dice,
      defence.dice * 10 + 1,
      expect.objectContaining({
        signal: controller.signal,
        requestId: 'defence-d10-signal',
      })
    )
  })

  it('honors an already-aborted signal before runtime defence D10 generation', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 1, value: 0 }
    const controller = new AbortController()
    controller.abort()

    await expect(calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      defence,
      {
        getDamageRollDistribution: pointProvider(2),
      },
      { signal: controller.signal },
      createRangePlan(attack, defence)
    )).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.each([
    {
      label: 'positive fixed difference and defence',
      attack: { dice: 0, value: 4, kazanari: 0 },
      defence: { dice: 1, value: 1 },
      expectedSupportMax: 12,
      expectedValue: 12,
    },
    {
      label: 'negative fixed difference',
      attack: { dice: 0, value: 0, kazanari: 0 },
      defence: { dice: 0, value: 5 },
      expectedSupportMax: 5,
      expectedValue: 5,
    },
  ])(
    'applies $label and trims values to finite modeled support',
    async ({ attack, defence, expectedSupportMax, expectedValue }) => {
      const rangePlan = createRangePlan(attack, defence)
      const dependencies = {
        getDamageRollDistribution: pointProvider(10),
        getD10Distribution: defence.dice > 0
          ? vi.fn(() => {
              const distribution = Array(11).fill(0)
              distribution[1] = 1
              return distribution
            })
          : undefined,
      }
      const { result, metadata } = await calculateCanonicalDamageOnDemand(
        scoreWithHitProbability(1),
        attack,
        defence,
        dependencies,
        {},
        rangePlan
      )

      expect(result.support).toEqual({
        kind: 'finite',
        max: expectedSupportMax,
      })
      expect(result.values).toHaveLength(expectedSupportMax + 1)
      expect(result.values[expectedValue]).toBeCloseTo(1, 12)
      expect(result.overflow).toBeNull()
      expect(metadata.modeledSupport).toEqual(result.support)
    }
  )

  it('reports exact modeled overflow separately from explicit values', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const rangePlan = createRangePlan(attack, noDefence, {
      rawSupportMax: 20,
      rawMax: 20,
      workingMax: 5,
      workingLength: 7,
      fftLength: 32,
    })
    const { result } = await calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(20) },
      {},
      rangePlan
    )

    expect(result.support).toEqual({ kind: 'finite', max: 20 })
    expect(result.values).toHaveLength(6)
    expect(result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 6,
      probability: 1,
      errorBound: 1e-8,
    })
  })

  it('uses final damage coordinates for defended overflow and preserves known tail mass', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 1, value: 0 }
    const rangePlan = createRangePlan(attack, defence, {
      rawSupportMax: 30,
      rawMax: 30,
      workingMax: 15,
      workingLength: 17,
      fftLength: 64,
      defenceFftLength: 32,
    })
    const dependencies = {
      getDamageRollDistribution: weightedRawProvider([
        [15, 0.25],
        [16, 0.75],
      ]),
      getD10Distribution: vi.fn(() => deterministicDefence(0)),
    }

    const { result } = await calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      defence,
      dependencies,
      {},
      rangePlan
    )

    expect(result.support).toEqual({ kind: 'finite', max: 29 })
    expect(result.values).toHaveLength(6)
    for (const probability of result.values) {
      expect(probability).toBeCloseTo(0, 12)
    }
    expect(result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 6,
      probability: 1,
      errorBound: 1e-8,
    })

  })

  it('uses the negative fixed difference in the final overflow lower bound', async () => {
    const attack = { dice: 0, value: -3, kazanari: 0 }
    const defence = { dice: 1, value: 0 }
    const rangePlan = createRangePlan(attack, defence, {
      rawSupportMax: 30,
      rawMax: 30,
      workingMax: 15,
      workingLength: 17,
      fftLength: 64,
      defenceFftLength: 32,
    })
    const { result } = await calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      defence,
      {
        getDamageRollDistribution: weightedRawProvider([
          [15, 0.4],
          [16, 0.6],
        ]),
        getD10Distribution: vi.fn(() => deterministicDefence(0)),
      },
      {},
      rangePlan
    )

    expect(result.support).toEqual({ kind: 'finite', max: 26 })
    expect(result.values).toHaveLength(3)
    expect(result.overflow).toMatchObject({
      kind: 'exact',
      lowerBound: 3,
      errorBound: 1e-8,
    })
    expect(result.overflow.probability).toBeCloseTo(1, 12)
  })

  it('uses empty explicit values when final overflow starts at zero', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 1, value: 0 }
    const rangePlan = createRangePlan(attack, defence, {
      rawSupportMax: 30,
      rawMax: 30,
      workingMax: 5,
      workingLength: 7,
      fftLength: 64,
      defenceFftLength: 32,
    })
    const { result } = await calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      defence,
      {
        getDamageRollDistribution: weightedRawProvider([
          [5, 0.25],
          [6, 0.75],
        ]),
        getD10Distribution: vi.fn(() => deterministicDefence(0)),
      },
      {},
      rangePlan
    )

    expect(result.support).toEqual({ kind: 'finite', max: 29 })
    expect(result.values).toHaveLength(0)
    expect(result.overflow).toMatchObject({
      kind: 'exact',
      lowerBound: 0,
      errorBound: 1e-8,
    })
    expect(result.overflow.probability).toBeCloseTo(1, 12)
  })

  it('defensively copies and freezes modeled/source metadata', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const rangePlan = createRangePlan(attack, noDefence)
    const originalTail = rangePlan.scores[0].tail
    const { metadata } = await calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(2) },
      {},
      rangePlan
    )
    originalTail.bound = 1

    expect(metadata).toMatchObject({
      modeledDistribution: true,
      scorePropagation: 'published-bucket',
      modeledSupport: { kind: 'finite', max: 10 },
      sourceSupport: { kind: 'infinite' },
    })
    expect(metadata.scoreTails[0].bound).toBe(2e-9)
    expect(metadata.scoreTails[0]).not.toBe(originalTail)
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(Object.isFrozen(metadata.scoreTails)).toBe(true)
    expect(Object.isFrozen(metadata.scoreTails[0])).toBe(true)
    expect(Object.isFrozen(metadata.modeledSupport)).toBe(true)
    expect(Object.isFrozen(metadata.sourceSupport)).toBe(true)
  })

  it('rejects missing sub-probability mass at final composition', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const incompleteScore = {
      action: canonicalScoreEnvelope([[1, 0.5]], {
        support: { kind: 'infinite' },
        overflow: {
          kind: 'exact',
          lowerBound: 2,
          probability: 0.5,
          errorBound: 0,
        },
      }),
      reaction: canonicalScoreEnvelope([[0, 1]]),
    }

    await expect(calculateCanonicalDamageOnDemand(
      incompleteScore,
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(2) },
      {},
      createRangePlan(attack, noDefence)
    )).rejects.toThrow('failure probability plus hit probability')
  })

  it('rejects a damage subplan in place of the required top-level plan', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const rangePlan = createRangePlan(attack, noDefence)

    await expect(calculateCanonicalDamageOnDemand(
      scoreWithHitProbability(1),
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(2) },
      {},
      rangePlan.damage
    )).rejects.toThrow('top-level attack plan')
  })

  it('aggregates canonical full-tail coverage into a dynamic damage-dice request', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const observedWeights = []
    const provider = pointProvider(0, [], observedWeights)
    const rangePlan = createRangePlan(attack, noDefence, {
      rawSupportMax: 2040,
      rawMax: 2040,
      workingMax: 2040,
      workingLength: 2042,
      fftLength: 4096,
      maxDamageDice: 204,
    }, 'full-tail')
    const score = {
      action: canonicalScoreEnvelope([[2030, 1]]),
      reaction: canonicalScoreEnvelope([[0, 1]]),
    }

    const canonical = await calculateCanonicalDamageOnDemand(
      score,
      attack,
      noDefence,
      { getDamageRollDistribution: provider },
      {},
      rangePlan
    )

    expect(provider).toHaveBeenCalledOnce()
    expect(observedWeights[0]).toHaveLength(205)
    expect(observedWeights[0][204]).toBeCloseTo(1, 12)
    expect(observedWeights[0][202]).toBe(0)
    expect(canonical.result.overflow).toBeNull()
    expect(canonical.result.support).toEqual({ kind: 'finite', max: 2040 })
    expect(canonical.metadata).toMatchObject({
      modeledDistribution: true,
      scorePropagation: 'full-tail',
      scoreTailProbabilityUpperBound: 0,
    })
  })

  it('keeps canonical score tail mass as overflow metadata instead of a point bucket', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const tailCertificate = {
      version: 1,
      kind: 'canonical-score-tail-certificate',
      massLowerBound: 0.4,
      massUpperBound: 0.4,
      lowerBound: 10,
      probabilityErrorBound: 0,
    }
    const canonical = await calculateCanonicalDamageOnDemand(
      {
        action: canonicalScoreEnvelope([[1, 0.6]], {
          support: { kind: 'infinite' },
          overflow: {
            kind: 'exact',
            lowerBound: 10,
            probability: 0.4,
            errorBound: 0,
          },
          metadata: { scoreTailCertificate: tailCertificate },
        }),
        reaction: canonicalScoreEnvelope([[0, 1]]),
      },
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(0) },
      {},
      createRangePlan(attack, noDefence, {}, 'full-tail')
    )

    expect(canonical.result.overflow).toEqual({
      kind: 'upper-bound',
      lowerBound: 0,
      probabilityUpperBound: 0.4,
      errorBound: 0,
    })
    expect(canonical.result.values[0]).toBeCloseTo(0.6, 12)
    expect(canonical.metadata.scoreTailCertificates[0]).toEqual(
      tailCertificate
    )
    expect(canonical.metadata.scoreTailProbabilityUpperBound)
      .toBeCloseTo(0.4, 12)
    expect(canonical.metadata.projectionUncertainty).toEqual({
      positionUnknownProbabilityUpperBound: 0.4,
      outputOverflowLowerBound: null,
    })
  })

  it('keeps reaction score tail uncertainty capable of reaching damage zero', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const canonical = await calculateCanonicalDamageOnDemand(
      {
        action: canonicalScoreEnvelope([[1, 1]]),
        reaction: canonicalScoreEnvelope([[0, 0.6]], {
          support: { kind: 'infinite' },
          overflow: {
            kind: 'exact',
            lowerBound: 1,
            probability: 0.4,
            errorBound: 0,
          },
        }),
      },
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(0) },
      {},
      createRangePlan(attack, noDefence, {}, 'full-tail')
    )

    expect(canonical.result.values[0]).toBeCloseTo(0.6, 12)
    expect(canonical.result.overflow).toMatchObject({
      kind: 'upper-bound',
      lowerBound: 0,
      probabilityUpperBound: 0.4,
    })
    expect(canonical.metadata.projectionUncertainty).toEqual({
      positionUnknownProbabilityUpperBound: 0.4,
      outputOverflowLowerBound: null,
    })
  })

  it('keeps a damage-output-only overflow positionally bounded', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const rangePlan = createRangePlan(
      attack,
      noDefence,
      {
        rawSupportMax: 20,
        rawMax: 20,
        workingMax: 5,
        workingLength: 7,
        fftLength: 32,
      },
      'full-tail'
    )
    const canonical = await calculateCanonicalDamageOnDemand(
      {
        action: canonicalScoreEnvelope([[1, 1]]),
        reaction: canonicalScoreEnvelope([[0, 1]]),
      },
      attack,
      noDefence,
      { getDamageRollDistribution: pointProvider(20) },
      {},
      rangePlan
    )

    expect(canonical.metadata.scoreTailProbabilityUpperBound).toBe(0)
    expect(canonical.result.overflow).toMatchObject({
      kind: 'upper-bound',
      lowerBound: 6,
      probabilityUpperBound: 1,
    })
    expect(canonical.metadata.projectionUncertainty).toEqual({
      positionUnknownProbabilityUpperBound: 0,
      outputOverflowLowerBound: 6,
    })
  })

  it('does not weaken the conservative bound when score and output tails coexist', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const rangePlan = createRangePlan(
      attack,
      noDefence,
      {
        rawSupportMax: 20,
        rawMax: 20,
        workingMax: 5,
        workingLength: 7,
        fftLength: 32,
      },
      'full-tail'
    )
    const canonical = await calculateCanonicalDamageOnDemand(
      {
        action: canonicalScoreEnvelope([[1, 0.6]], {
          support: { kind: 'infinite' },
          overflow: {
            kind: 'exact',
            lowerBound: 2,
            probability: 0.4,
            errorBound: 0,
          },
        }),
        reaction: canonicalScoreEnvelope([[0, 0.6]], {
          support: { kind: 'infinite' },
          overflow: {
            kind: 'exact',
            lowerBound: 1,
            probability: 0.4,
            errorBound: 0,
          },
        }),
      },
      attack,
      noDefence,
      {
        getDamageRollDistribution: weightedRawProvider([
          [0, 0.75],
          [6, 0.25],
        ]),
      },
      {},
      rangePlan
    )

    expect(canonical.result.overflow).toMatchObject({
      kind: 'upper-bound',
      lowerBound: 0,
      probabilityUpperBound: 0.82,
    })
    expect(canonical.metadata.projectionUncertainty).toMatchObject({
      positionUnknownProbabilityUpperBound: 0.64,
      outputOverflowLowerBound: 6,
    })
  })
})
