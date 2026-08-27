import { describe, expect, it } from 'vitest'

import {
  calculateCanonicalDamageOnDemand,
  calculateDamageOnDemand,
  getTotalDamage,
} from '../src/calculation/DamageCalculator'
import { calculateD10Distributions } from '../src/calculation/BacktrackCalculator'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { calculateScore } from '../src/calculation/ScoreCalculator'
import {
  compareLegacyAndCanonicalDistributions,
  compareLegacyAndCanonicalTotalDamage,
} from '../src/calculation/LegacyCanonicalComparison'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import { sumCanonicalDamage } from '../src/calculation/CanonicalDamageAggregation'
import {
  createDistributionResult,
  DISTRIBUTION_RESULT_ERROR_CODES,
  toPublishedBucketDistribution,
} from '../src/calculation/DistributionResult'

function probabilityResult(entries) {
  const distribution = Array(1024).fill(0)
  for (const [value, probability] of entries) {
    distribution[value] = probability
  }
  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}

function getUpperTailProbability(distribution) {
  const result = Array(distribution.length).fill(0)
  result[0] = 1
  for (let value = 1; value < distribution.length; value += 1) {
    result[value] = result[value - 1] - distribution[value - 1]
  }
  return result
}

function createEnvelope({
  values,
  offset = 0,
  support = { kind: 'finite', max: values.length - 1 },
  overflow = null,
  metadata = {},
}) {
  return {
    result: createDistributionResult({
      values,
      offset,
      support,
      overflow,
    }),
    metadata: {
      modeledDistribution: true,
      ...metadata,
    },
  }
}

function createActualFixture({
  attackValue,
  defenceValue,
  kazanari,
}) {
  const attack = { dice: 0, value: attackValue, kazanari }
  const defence = { dice: 1, value: defenceValue }
  const scoreParams = {
    action: {
      dice: 1,
      critical: 10,
      skill: 0,
      yousei: 0,
      shihai: 0,
    },
    reaction: {
      dice: 1,
      critical: 10,
      skill: 0,
      yousei: 0,
      shihai: 0,
    },
  }
  const rangePlan = planCalculationRanges({
    operation: 'attack',
    score: scoreParams,
    attack,
    defence,
  })
  expect(rangePlan.accepted).toBe(true)

  const getDxDistribution = (shihai, dice, critical, options) =>
    calculateDxDistribution({ dice, critical, shihai }, options)
  const score = {
    action: calculateScore(
      scoreParams.action,
      { getDxDistribution },
      false,
      rangePlan.scores[0]
    ),
    reaction: calculateScore(
      scoreParams.reaction,
      { getDxDistribution },
      false,
      rangePlan.scores[1]
    ),
  }
  const dependencies = {
    getDamageRollDistribution: generateMixedDamageDistribution,
    getD10Distribution: (dice, length) =>
      calculateD10Distributions([dice], length).get(dice),
  }

  return Promise.all([
    calculateDamageOnDemand(
      score,
      attack,
      defence,
      dependencies,
      {},
      rangePlan.damage
    ),
    calculateCanonicalDamageOnDemand(
      score,
      attack,
      defence,
      dependencies,
      {},
      rangePlan
    ),
  ]).then(([legacy, canonical]) => ({
    attack,
    defence,
    legacy,
    canonical,
    score,
  }))
}

function createNarrowRangePlan(attack, defence) {
  return {
    accepted: true,
    operation: 'attack',
    propagation: { score: 'published-bucket' },
    scores: [{ tail: { kind: 'fixture', bound: 0, modeledMax: 1 } }],
    damage: {
      fixedDifference: attack.value - defence.value,
      rawSupportMax: 20,
      rawMax: 20,
      workingMax: 5,
      workingLength: 7,
      defenceMax: defence.dice * 10,
      fftLength: 32,
      defenceFftLength: 0,
      scoreValueMode: 'published-bucket',
    },
  }
}

describe('legacy/canonical numerical comparison contract', () => {
  it('reports all difference metrics and keeps the inputs unchanged', () => {
    const canonical = createEnvelope({ values: [0.25, 0.75] })
    const legacy = Array(1024).fill(0)
    legacy[0] = 0.25 + 1e-6
    legacy[1] = 0.75 - 1e-6
    const legacyBefore = legacy.slice()
    const canonicalBefore = Array.from(canonical.result.values)

    const comparison = compareLegacyAndCanonicalDistributions(
      legacy,
      canonical
    )

    expect(comparison).toMatchObject({
      kind: 'comparable',
      scope: 'damage',
      legacyMass: 1,
      canonicalMass: 1,
      massDifference: 0,
      thresholds: {
        mass: 1e-8,
        maxAbsolute: 2e-6,
        l1: 2e-4,
      },
      passed: true,
    })
    expect(comparison.maxAbsoluteDifference).toBeCloseTo(1e-6, 12)
    expect(comparison.l1Difference).toBeCloseTo(2e-6, 12)
    expect(Object.isFrozen(comparison)).toBe(true)
    expect(Object.isFrozen(comparison.thresholds)).toBe(true)
    expect(legacy).toEqual(legacyBefore)
    expect(Array.from(canonical.result.values)).toEqual(canonicalBefore)

    const massDrift = legacyBefore.slice()
    massDrift[0] += 5e-9
    const massComparison = compareLegacyAndCanonicalDistributions(
      massDrift,
      canonical
    )
    expect(massComparison.massDifference).toBeCloseTo(5e-9, 12)
    expect(massComparison.passed).toBe(true)
  })

  it.each([
    {
      label: 'fixed shift and defence',
      attackValue: 4,
      defenceValue: 1,
      kazanari: 0,
    },
    {
      label: 'kazanari and failure mass',
      attackValue: 2,
      defenceValue: 1,
      kazanari: 3,
    },
  ])(
    'compares actual calculation fixture: $label',
    async ({ attackValue, defenceValue, kazanari }) => {
      const fixture = await createActualFixture({
        attackValue,
        defenceValue,
        kazanari,
      })

      expect(fixture.score.action.failureProbability).toBeGreaterThan(0)
      const comparison = compareLegacyAndCanonicalDistributions(
        fixture.legacy.distribution,
        fixture.canonical
      )

      expect(comparison.kind).toBe('comparable')
      expect(comparison.passed).toBe(true)
      expect(comparison.maxAbsoluteDifference).toBeLessThanOrEqual(2e-6)
      expect(comparison.l1Difference).toBeLessThanOrEqual(2e-4)
      expect(comparison.massDifference).toBeLessThanOrEqual(1e-8)
    }
  )

  it('compares an actual multi-combo total only when no component overflow is involved', async () => {
    const first = await createActualFixture({
      attackValue: 2,
      defenceValue: 1,
      kazanari: 0,
    })
    const second = await createActualFixture({
      attackValue: 3,
      defenceValue: 1,
      kazanari: 3,
    })
    const legacyTotal = getTotalDamage([
      { data: { damage: first.legacy } },
      { data: { damage: second.legacy } },
    ])
    const canonicalTotal = sumCanonicalDamage([
      first.canonical,
      second.canonical,
    ])
    expect(first.canonical.result.overflow).toBeNull()
    expect(second.canonical.result.overflow).toBeNull()

    const comparison = compareLegacyAndCanonicalTotalDamage(
      legacyTotal.distribution,
      canonicalTotal
    )

    expect(comparison).toMatchObject({
      kind: 'comparable',
      scope: 'total',
      passed: true,
    })
    expect(comparison.maxAbsoluteDifference).toBeLessThanOrEqual(2e-6)
    expect(comparison.l1Difference).toBeLessThanOrEqual(2e-4)
    expect(comparison.massDifference).toBeLessThanOrEqual(1e-8)
  })

  it('returns not-comparable for valid upper-bound and unsafe exact projections', () => {
    const legacy = Array(1024).fill(0)
    legacy[0] = 1
    const unsafeExact = createEnvelope({
      values: [0.5],
      support: { kind: 'finite', max: 10 },
      overflow: {
        kind: 'exact',
        lowerBound: 6,
        probability: 0.5,
        errorBound: 0,
      },
    })
    const upperBound = createEnvelope({
      values: [0.5],
      support: { kind: 'finite', max: 10 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 6,
        probabilityUpperBound: 0.5,
        errorBound: 0,
      },
    })

    expect(
      compareLegacyAndCanonicalDistributions(legacy, unsafeExact)
    ).toMatchObject({
      kind: 'not-comparable',
      reason: 'unsafe-exact-overflow',
      passed: false,
    })
    expect(
      compareLegacyAndCanonicalDistributions(legacy, upperBound)
    ).toMatchObject({
      kind: 'not-comparable',
      reason: 'upper-bound-overflow',
      passed: false,
    })
  })

  it('returns not-comparable for an overflow produced by total aggregation', () => {
    const legacy = Array(1024).fill(0)
    legacy[1023] = 1
    const canonicalTotal = createEnvelope({
      values: [0.5],
      support: { kind: 'finite', max: 2000 },
      overflow: {
        kind: 'exact',
        lowerBound: 1023,
        probability: 0.5,
        errorBound: 0,
      },
      metadata: {
        aggregation: 'independent-sum',
        componentDescriptors: [{
          overflow: {
            kind: 'exact',
            lowerBound: 1023,
            probability: 0.5,
            errorBound: 0,
          },
        }],
      },
    })

    expect(
      compareLegacyAndCanonicalTotalDamage(legacy, canonicalTotal)
    ).toMatchObject({
      kind: 'not-comparable',
      reason: 'total-overflow',
      passed: false,
    })
  })

  it('only treats active result and component overflow as total involvement', () => {
    const legacy = Array(1024).fill(0)
    legacy[0] = 1

    const inactiveExact = createEnvelope({
      values: [1],
      support: { kind: 'finite', max: 2000 },
      overflow: {
        kind: 'exact',
        lowerBound: 6,
        probability: 0,
        errorBound: 0,
      },
      metadata: {
        componentDescriptors: [{
          overflow: {
            kind: 'exact',
            lowerBound: 6,
            probability: 0,
            errorBound: 0,
          },
        }],
      },
    })
    expect(
      compareLegacyAndCanonicalTotalDamage(legacy, inactiveExact)
    ).toMatchObject({
      kind: 'comparable',
      passed: true,
    })

    const activeExactErrorBound = createEnvelope({
      values: [1],
      overflow: null,
      metadata: {
        componentDescriptors: [{
          overflow: {
            kind: 'exact',
            lowerBound: 6,
            probability: 0,
            errorBound: 1e-9,
          },
        }],
      },
    })
    expect(
      compareLegacyAndCanonicalTotalDamage(legacy, activeExactErrorBound)
    ).toMatchObject({
      kind: 'not-comparable',
      reason: 'total-overflow',
      passed: false,
    })

    const inactiveUpperBound = createEnvelope({
      values: [1],
      metadata: {
        componentDescriptors: [{
          overflow: {
            kind: 'upper-bound',
            lowerBound: 6,
            probabilityUpperBound: 0,
            errorBound: 0,
          },
        }],
      },
    })
    expect(
      compareLegacyAndCanonicalTotalDamage(legacy, inactiveUpperBound)
    ).toMatchObject({
      kind: 'comparable',
      passed: true,
    })

    const activeUpperBound = createEnvelope({
      values: [1],
      metadata: {
        componentDescriptors: [{
          overflow: {
            kind: 'upper-bound',
            lowerBound: 6,
            probabilityUpperBound: 1e-9,
            errorBound: 0,
          },
        }],
      },
    })
    expect(
      compareLegacyAndCanonicalTotalDamage(legacy, activeUpperBound)
    ).toMatchObject({
      kind: 'not-comparable',
      reason: 'total-overflow',
      passed: false,
    })
  })

  it('keeps invalid input as the existing typed adapter error', () => {
    const canonical = createEnvelope({ values: [1] })

    expect(() => compareLegacyAndCanonicalDistributions(
      new Float64Array(1023),
      canonical
    )).toThrow(expect.objectContaining({
      code: DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH,
    }))
  })

  it('snapshots Array and Float64Array legacy inputs and rejects unsafe sources', () => {
    const canonical = createEnvelope({ values: [1] })
    const validLegacy = () => [1, ...Array(1023).fill(0)]
    const typedLegacy = new Float64Array(validLegacy())
    const typedBefore = typedLegacy.slice()

    expect(
      compareLegacyAndCanonicalDistributions(typedLegacy, canonical)
    ).toMatchObject({
      kind: 'comparable',
      passed: true,
    })
    expect(Array.from(typedLegacy)).toEqual(Array.from(typedBefore))

    const revoked = Proxy.revocable(validLegacy(), {})
    revoked.revoke()
    expect(() => compareLegacyAndCanonicalDistributions(
      revoked.proxy,
      canonical
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_INPUT,
    }))

    const accessor = validLegacy()
    Object.defineProperty(accessor, '0', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('legacy value accessor must not run')
      },
    })
    expect(() => compareLegacyAndCanonicalDistributions(
      accessor,
      canonical
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    }))

    const reflectionFailure = new Proxy(validLegacy(), {
      getOwnPropertyDescriptor(target, property) {
        if (property === '1') {
          throw new Error('legacy reflection failed')
        }
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    expect(() => compareLegacyAndCanonicalDistributions(
      reflectionFailure,
      canonical
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    }))

    const sparse = Array(1024)
    sparse[0] = 1
    expect(() => compareLegacyAndCanonicalDistributions(
      sparse,
      canonical
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY,
    }))
  })

  it('maps revoked canonical input to INVALID_SCHEMA without leaking a native error', () => {
    const canonical = createEnvelope({ values: [1] })
    const revoked = Proxy.revocable(canonical, {})
    revoked.revoke()

    expect(() => compareLegacyAndCanonicalDistributions(
      [1, ...Array(1023).fill(0)],
      revoked.proxy
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    }))
  })

  it('maps result accessors to INVALID_SCHEMA without invoking the accessor', () => {
    const canonical = createEnvelope({ values: [1] })
    Object.defineProperty(canonical, 'result', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('result accessor must not run')
      },
    })

    expect(() => compareLegacyAndCanonicalDistributions(
      [1, ...Array(1023).fill(0)],
      canonical
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    }))
  })

  it('maps metadata overflow proxies to INVALID_SCHEMA', () => {
    const overflow = Proxy.revocable({
      kind: 'exact',
      lowerBound: 6,
      probability: 0,
      errorBound: 0,
    }, {})
    overflow.revoke()
    const canonical = createEnvelope({
      values: [1],
      metadata: {
        componentDescriptors: [{ overflow: overflow.proxy }],
      },
    })

    expect(() => compareLegacyAndCanonicalTotalDamage(
      [1, ...Array(1023).fill(0)],
      canonical
    )).toThrow(expect.objectContaining({
      name: 'DistributionResultAdapterError',
      code: DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
    }))
  })

  it.each([
    ['invalid kind', {
      kind: 'invalid',
      lowerBound: 6,
      probability: 0,
      errorBound: 0,
    }],
    ['negative lower bound', {
      kind: 'exact',
      lowerBound: -1,
      probability: 0,
      errorBound: 0,
    }],
    ['fractional lower bound', {
      kind: 'exact',
      lowerBound: 6.5,
      probability: 0,
      errorBound: 0,
    }],
    ['non-finite exact probability', {
      kind: 'exact',
      lowerBound: 6,
      probability: Number.NaN,
      errorBound: 0,
    }],
    ['negative exact probability', {
      kind: 'exact',
      lowerBound: 6,
      probability: -0.1,
      errorBound: 0,
    }],
    ['non-finite exact error bound', {
      kind: 'exact',
      lowerBound: 6,
      probability: 0,
      errorBound: Number.NaN,
    }],
    ['negative exact error bound', {
      kind: 'exact',
      lowerBound: 6,
      probability: 0,
      errorBound: -0.1,
    }],
    ['non-finite upper-bound probability', {
      kind: 'upper-bound',
      lowerBound: 6,
      probabilityUpperBound: Number.NaN,
      errorBound: 0,
    }],
    ['negative upper-bound probability', {
      kind: 'upper-bound',
      lowerBound: 6,
      probabilityUpperBound: -0.1,
      errorBound: 0,
    }],
    ['upper-bound probability above one', {
      kind: 'upper-bound',
      lowerBound: 6,
      probabilityUpperBound: 1.1,
      errorBound: 0,
    }],
    ['non-finite upper-bound error bound', {
      kind: 'upper-bound',
      lowerBound: 6,
      probabilityUpperBound: 0,
      errorBound: Number.NaN,
    }],
    ['negative upper-bound error bound', {
      kind: 'upper-bound',
      lowerBound: 6,
      probabilityUpperBound: 0,
      errorBound: -0.1,
    }],
  ])(
    'rejects invalid component descriptor overflow: %s',
    (_label, overflow) => {
      const canonical = createEnvelope({
        values: [1],
        metadata: {
          componentDescriptors: [{ overflow }],
        },
      })
      const legacy = [1, ...Array(1023).fill(0)]

      expect(() => compareLegacyAndCanonicalTotalDamage(
        legacy,
        canonical
      )).toThrow(expect.objectContaining({
        name: 'DistributionResultAdapterError',
        code: DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA,
      }))
    }
  )

  it('maps scope and threshold accessors to INVALID_OPTIONS', () => {
    const canonical = createEnvelope({ values: [1] })
    const legacy = [1, ...Array(1023).fill(0)]
    const scopeOptions = {}
    Object.defineProperty(scopeOptions, 'scope', {
      enumerable: true,
      get() {
        throw new Error('scope accessor must not run')
      },
    })

    expect(() => compareLegacyAndCanonicalDistributions(
      legacy,
      canonical,
      scopeOptions
    )).toThrow(expect.objectContaining({
      name: 'LegacyCanonicalComparisonError',
      code: 'invalid-options',
    }))

    const thresholds = {}
    Object.defineProperty(thresholds, 'maxAbsolute', {
      enumerable: true,
      get() {
        throw new Error('threshold accessor must not run')
      },
    })
    expect(() => compareLegacyAndCanonicalDistributions(
      legacy,
      canonical,
      { thresholds }
    )).toThrow(expect.objectContaining({
      name: 'LegacyCanonicalComparisonError',
      code: 'invalid-options',
    }))
  })

  it('marks a valid actual calculation with an unprovable lower overflow as not-comparable', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const rangePlan = createNarrowRangePlan(attack, defence)
    const score = {
      action: probabilityResult([[1, 1]]),
      reaction: probabilityResult([[0, 1]]),
    }
    const getDamageRollDistribution = async (_weights, _kazanari, options) => {
      const distribution = new Float64Array(options.distributionLength)
      distribution[distribution.length - 1] = 1
      return distribution
    }
    const dependencies = { getDamageRollDistribution }
    const [legacy, canonical] = await Promise.all([
      calculateDamageOnDemand(
        score,
        attack,
        defence,
        dependencies,
        {},
        rangePlan.damage
      ),
      calculateCanonicalDamageOnDemand(
        score,
        attack,
        defence,
        dependencies,
        {},
        rangePlan
      ),
    ])

    expect(legacy.distribution[1023]).toBe(1)
    expect(canonical.result.overflow.lowerBound).toBe(6)
    expect(
      compareLegacyAndCanonicalDistributions(legacy.distribution, canonical)
    ).toMatchObject({
      kind: 'not-comparable',
      reason: 'unsafe-exact-overflow',
    })
  })

  it('reuses the published adapter for safe exact overflow at bucket 1023', () => {
    const canonical = createEnvelope({
      values: [0.5],
      support: { kind: 'finite', max: 2000 },
      overflow: {
        kind: 'exact',
        lowerBound: 1023,
        probability: 0.5,
        errorBound: 0,
      },
    })
    const legacy = toPublishedBucketDistribution(canonical.result)

    expect(
      compareLegacyAndCanonicalDistributions(legacy, canonical)
    ).toMatchObject({
      kind: 'comparable',
      passed: true,
      maxAbsoluteDifference: 0,
      l1Difference: 0,
      massDifference: 0,
    })
  })

  it('fails just beyond the max-absolute threshold', () => {
    const canonical = createEnvelope({ values: [0.5, 0.5] })
    const delta = 2e-6 + 1e-10
    const legacy = Array(1024).fill(0)
    legacy[0] = 0.5 + delta
    legacy[1] = 0.5 - delta

    const comparison = compareLegacyAndCanonicalDistributions(
      legacy,
      canonical
    )

    expect(comparison.kind).toBe('comparable')
    expect(comparison.maxAbsoluteDifference).toBeGreaterThan(2e-6)
    expect(comparison.passed).toBe(false)
  })
})
