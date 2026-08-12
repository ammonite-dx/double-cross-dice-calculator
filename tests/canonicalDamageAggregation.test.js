import { describe, expect, it, vi } from 'vitest'

import {
  CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES,
  CANONICAL_DAMAGE_AGGREGATION_MAX_COMPONENTS,
  CANONICAL_DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
  CanonicalDamageAggregationError,
  planCanonicalDamageAggregation,
  sumCanonicalDamage,
} from '../src/calculation'
import {
  createDistributionResult,
  DISTRIBUTION_RESULT_TOLERANCE,
} from '../src/calculation/DistributionResult'

function createEnvelope({
  values,
  offset = 0,
  support = null,
  overflow = null,
  sourceSupport = { kind: 'infinite' },
  metadata = {},
}) {
  const normalizedSupport = support ?? {
    kind: 'finite',
    max: Math.max(0, values.length - 1),
  }
  return {
    result: createDistributionResult({
      values,
      offset,
      support: normalizedSupport,
      overflow,
    }),
    metadata: {
      modeledDistribution: true,
      sourceSupport,
      ...metadata,
    },
  }
}

function expectAggregationError(run, code) {
  try {
    run()
    throw new Error('expected aggregation error')
  } catch (error) {
    expect(error).toBeInstanceOf(CanonicalDamageAggregationError)
    expect(error.code).toBe(code)
    return error
  }
}

describe('canonical damage aggregation', () => {
  it('returns a frozen zero identity for no components', () => {
    const aggregate = sumCanonicalDamage([])

    expect(Array.from(aggregate.result.values)).toEqual([1])
    expect(aggregate.result.offset).toBe(0)
    expect(aggregate.result.support).toEqual({ kind: 'finite', max: 0 })
    expect(aggregate.result.overflow).toBeNull()
    expect(aggregate.metadata).toMatchObject({
      modeledDistribution: true,
      aggregation: 'independent-sum',
      independence: 'assumed',
      componentCount: 0,
      modeledSupport: { kind: 'finite', max: 0 },
      sourceSupport: { kind: 'finite', max: 0 },
      overflowProbabilityLowerBound: 0,
      aggregationErrorBound: 0,
    })
    expect(Object.isFrozen(aggregate)).toBe(true)
    expect(Object.isFrozen(aggregate.result)).toBe(true)
    expect(Object.isFrozen(aggregate.metadata)).toBe(true)
    expect(Object.isFrozen(aggregate.metadata.componentDescriptors)).toBe(true)
  })

  it('copies one result without invoking FFT and creates aggregate metadata', () => {
    const input = createEnvelope({
      values: [0.25, 0.75],
      offset: 3,
      support: { kind: 'finite', max: 9 },
      sourceSupport: { kind: 'finite', max: 12 },
    })
    const onFftLength = vi.fn()
    const aggregate = sumCanonicalDamage([input], { onFftLength })

    expect(aggregate.result).not.toBe(input.result)
    expect(aggregate.result).toStrictEqual(input.result)
    expect(aggregate.result.values).not.toBe(input.result.values)
    expect(onFftLength).not.toHaveBeenCalled()
    expect(aggregate.metadata.componentCount).toBe(1)
    expect(aggregate.metadata.sourceSupport).toEqual({ kind: 'finite', max: 12 })
    expect(aggregate.metadata.componentDescriptors[0]).toMatchObject({
      index: 0,
      offset: 3,
      valuesLength: 2,
      sourceSupport: { kind: 'finite', max: 12 },
    })
    expect(aggregate.metadata.componentDescriptors[0]).not.toHaveProperty('support')
  })

  it('performs complete unequal-length convolution and sums offsets/support', () => {
    const first = createEnvelope({
      values: [0.5, 0.5],
      offset: 1,
      support: { kind: 'finite', max: 4 },
      sourceSupport: { kind: 'finite', max: 5 },
    })
    const second = createEnvelope({
      values: [0.25, 0.75, 0],
      offset: 2,
      support: { kind: 'finite', max: 7 },
      sourceSupport: { kind: 'infinite' },
    })
    const observedFftLengths = []
    const aggregate = sumCanonicalDamage([first, second], {
      onFftLength: (length) => observedFftLengths.push(length),
    })

    expect(Array.from(aggregate.result.values)).toEqual([
      expect.closeTo(0.125, 12),
      expect.closeTo(0.5, 12),
      expect.closeTo(0.375, 12),
      expect.closeTo(0, 12),
    ])
    expect(aggregate.result.offset).toBe(3)
    expect(aggregate.result.support).toEqual({ kind: 'finite', max: 11 })
    expect(aggregate.metadata.modeledSupport).toEqual({ kind: 'finite', max: 11 })
    expect(aggregate.metadata.sourceSupport).toEqual({ kind: 'infinite' })
    expect(observedFftLengths).toEqual([4])
  })

  it('propagates exact, null, upper-bound, and mixed overflow conservatively', () => {
    const exact = createEnvelope({
      values: [0.75],
      support: { kind: 'finite', max: 6 },
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.25,
        errorBound: 0.1,
      },
    })
    const exactSecond = createEnvelope({
      values: [0.6],
      support: { kind: 'finite', max: 8 },
      overflow: {
        kind: 'exact',
        lowerBound: 8,
        probability: 0.4,
        errorBound: 0.2,
      },
    })
    const exactAggregate = sumCanonicalDamage([exact, exactSecond])
    expect(exactAggregate.result.overflow).toMatchObject({
      kind: 'exact',
      lowerBound: 4,
      probability: 0.55,
    })
    expect(exactAggregate.result.overflow.errorBound).toBeCloseTo(0.3, 12)
    expect(exactAggregate.metadata.overflowProbabilityLowerBound).toBeCloseTo(
      0.55,
      12
    )
    expect(exactAggregate.metadata.aggregationErrorBound).toBeCloseTo(0.3, 12)

    const upper = createEnvelope({
      values: [0.5],
      support: { kind: 'finite', max: 9 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 9,
        probabilityUpperBound: 0.5,
        errorBound: 0.4,
      },
    })
    const mixed = sumCanonicalDamage([exact, upper])
    expect(mixed.result.overflow).toMatchObject({
      kind: 'upper-bound',
      lowerBound: 4,
      probabilityUpperBound: 0.625,
    })
    expect(mixed.result.overflow.errorBound).toBeCloseTo(0.5, 12)
    expect(mixed.metadata.overflowProbabilityLowerBound).toBeCloseTo(0.25, 12)
    expect(mixed.metadata.sourceOverflowProbabilityUpperBound).toBeCloseTo(
      0.625,
      12
    )
    expect(mixed.metadata).not.toHaveProperty('components')
    expect(mixed.metadata).not.toHaveProperty('rawOverflowProbabilityUpperBound')
    expect(mixed.metadata).not.toHaveProperty('convolutionMassDrift')
    expect(mixed.metadata).not.toHaveProperty('normalizationMassDrift')

    const nullOnly = sumCanonicalDamage([
      createEnvelope({ values: [1] }),
      createEnvelope({ values: [1] }),
    ])
    expect(nullOnly.result.overflow).toBeNull()
  })

  it('does not turn an overflow tail into a lower-bound point mass', () => {
    const aggregate = sumCanonicalDamage([
      createEnvelope({
        values: [0.5, 0.5],
        support: { kind: 'finite', max: 10 },
        overflow: {
          kind: 'exact',
          lowerBound: 10,
          probability: 0,
          errorBound: 0,
        },
      }),
      createEnvelope({
        values: [1],
        support: { kind: 'finite', max: 2 },
      }),
    ])

    expect(Array.from(aggregate.result.values)).toEqual([
      expect.closeTo(0.5, 12),
      expect.closeTo(0.5, 12),
    ])
    expect(aggregate.result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 0,
      probability: 0,
      errorBound: 0,
    })
  })

  it('keeps an empty explicit range empty and preserves inert error metadata', () => {
    const aggregate = sumCanonicalDamage([
      createEnvelope({
        values: [],
        support: { kind: 'finite', max: 5 },
        overflow: {
          kind: 'exact',
          lowerBound: 5,
          probability: 1,
          errorBound: 0.125,
        },
      }),
      createEnvelope({ values: [1] }),
    ])

    expect(aggregate.result.values).toHaveLength(0)
    expect(aggregate.result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 5,
      probability: 1,
      errorBound: 0.125,
    })
    expect(aggregate.metadata.aggregationErrorBound).toBe(0.125)
  })

  it('normalizes exact output probability from final empty explicit mass at the tolerance boundary', () => {
    const sourceProbability = 1 - DISTRIBUTION_RESULT_TOLERANCE / 2
    const aggregate = sumCanonicalDamage([
      createEnvelope({
        values: [],
        support: { kind: 'finite', max: 5 },
        overflow: {
          kind: 'exact',
          lowerBound: 5,
          probability: sourceProbability,
          errorBound: 0,
        },
      }),
      createEnvelope({ values: [1] }),
    ])

    expect(aggregate.result.values).toHaveLength(0)
    expect(aggregate.result.overflow.probability).toBe(1)
    expect(aggregate.metadata.sourceOverflowProbability).toBeCloseTo(
      sourceProbability,
      12
    )
    expect(aggregate.metadata.sourceMassDrift).toBeCloseTo(
      DISTRIBUTION_RESULT_TOLERANCE / 2,
      12
    )
    expect(aggregate.metadata.aggregationErrorBound).toBeGreaterThanOrEqual(
      aggregate.metadata.sourceMassDrift
    )
  })

  it('uses stable union probability for many tiny independent tails', () => {
    const probability = 1e-16
    const componentCount = 2_048
    const aggregate = sumCanonicalDamage(
      Array.from({ length: componentCount }, () => createEnvelope({
        values: [1 - probability],
        support: { kind: 'finite', max: 1 },
        overflow: {
          kind: 'exact',
          lowerBound: 1,
          probability,
          errorBound: 0,
        },
      }))
    )
    const expected = -Math.expm1(
      componentCount * Math.log1p(-probability)
    )

    expect(aggregate.metadata.sourceOverflowProbability).toBeCloseTo(
      expected,
      25
    )
  })

  it('leaves input envelopes and values unchanged and freezes descriptors', () => {
    const first = createEnvelope({
      values: [0.2, 0.8],
      support: { kind: 'finite', max: 2 },
      overflow: {
        kind: 'exact',
        lowerBound: 2,
        probability: 0,
        errorBound: 0,
      },
    })
    const second = createEnvelope({
      values: [0.4, 0.6],
      support: { kind: 'finite', max: 3 },
    })
    const firstValues = Array.from(first.result.values)
    const secondValues = Array.from(second.result.values)
    const aggregate = sumCanonicalDamage([first, second])

    expect(Array.from(first.result.values)).toEqual(firstValues)
    expect(Array.from(second.result.values)).toEqual(secondValues)
    expect(Object.isFrozen(aggregate.metadata.componentDescriptors[0])).toBe(true)
    expect(Object.isFrozen(aggregate.metadata.componentDescriptors[0].modeledSupport)).toBe(
      true
    )
    expect(Object.isFrozen(aggregate.metadata.componentDescriptors[0].overflow)).toBe(
      true
    )
  })

  it('rejects null, unmodeled, invalid source support, and invalid result envelopes', () => {
    expectAggregationError(
      () => sumCanonicalDamage([null]),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE
    )
    expectAggregationError(
      () => sumCanonicalDamage([{ result: createEnvelope({ values: [1] }).result, metadata: {} }]),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE
    )
    expectAggregationError(
      () => sumCanonicalDamage([createEnvelope({ values: [1], sourceSupport: null })]),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE
    )
    expectAggregationError(
      () => sumCanonicalDamage([{
        result: null,
        metadata: { modeledDistribution: true, sourceSupport: { kind: 'infinite' } },
      }]),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE
    )
  })

  it('rejects unsafe indexes and configurable resource limits before FFT allocation', () => {
    const largeOffset = createEnvelope({
      values: [],
      offset: Number.MAX_SAFE_INTEGER,
      support: { kind: 'finite', max: Number.MAX_SAFE_INTEGER },
      overflow: {
        kind: 'exact',
        lowerBound: Number.MAX_SAFE_INTEGER,
        probability: 1,
        errorBound: 0,
      },
    })
    expectAggregationError(
      () => sumCanonicalDamage([
        largeOffset,
        createEnvelope({
          values: [1],
          offset: 1,
          support: { kind: 'finite', max: 1 },
        }),
      ]),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INDEX_OVERFLOW
    )
    expectAggregationError(
      () => sumCanonicalDamage([
        createEnvelope({ values: [0.5, 0.5] }),
        createEnvelope({ values: [0.5, 0.5] }),
      ], { maxValuesLength: 2 }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT
    )
    expectAggregationError(
      () => sumCanonicalDamage(new Array(CANONICAL_DAMAGE_AGGREGATION_MAX_COMPONENTS + 1)),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT
    )
    expectAggregationError(
      () => sumCanonicalDamage([
        createEnvelope({ values: [1] }),
      ], { maxValuesLength: 1, maxResourceBytes: 1_024 }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT
    )
    expectAggregationError(
      () => sumCanonicalDamage([
        createEnvelope({ values: [0.5, 0.5] }),
        createEnvelope({ values: [0.5, 0.5] }),
      ], { maxFftLength: 2 }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT
    )
  })

  it('supports abort and propagates the actual FFT length callback', () => {
    const controller = new AbortController()
    const observed = []
    expectAggregationError(
      () => sumCanonicalDamage([
        createEnvelope({ values: [0.5, 0.5] }),
        createEnvelope({ values: [0.5, 0.5] }),
      ], {
        signal: controller.signal,
        onFftLength: (length) => {
          observed.push(length)
          controller.abort()
        },
      }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.ABORTED
    )
    expect(observed).toEqual([4])
  })

  it('publishes a frozen resource plan and executes that exact plan', () => {
    const first = createEnvelope({ values: [0.5, 0.5] })
    const second = createEnvelope({ values: [0.25, 0.75] })
    const canonicalDamages = [first, second]
    const onFftLength = vi.fn()
    const plan = planCanonicalDamageAggregation(canonicalDamages)

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.estimates)).toBe(true)
    expect(Object.isFrozen(plan.steps)).toBe(true)
    expect(plan.estimates.float64Bytes).toBeGreaterThan(0)
    expect(plan.estimates.fftLengths).toEqual([4])
    expect(onFftLength).not.toHaveBeenCalled()

    const aggregate = sumCanonicalDamage(canonicalDamages, {
      plan,
      onFftLength,
    })

    expect(onFftLength).toHaveBeenCalledOnce()
    expect(onFftLength).toHaveBeenCalledWith(plan.steps[0].fftLength)
    expect(Array.from(aggregate.result.values)).toEqual([
      expect.closeTo(0.125, 12),
      expect.closeTo(0.5, 12),
      expect.closeTo(0.375, 12),
    ])
  })

  it('keeps planned coefficients private from later caller mutation', () => {
    const first = createEnvelope({ values: [0.5, 0.5] })
    const second = createEnvelope({ values: [0.25, 0.75] })
    const canonicalDamages = [first, second]
    const plan = planCanonicalDamageAggregation(canonicalDamages)

    first.result.values[0] = 1
    first.result.values[1] = 0
    const aggregate = sumCanonicalDamage(canonicalDamages, {
      plan,
      onFftLength: () => {
        second.result.values[0] = 1
        second.result.values[1] = 0
      },
    })

    expect(Array.from(aggregate.result.values)).toEqual([
      expect.closeTo(0.125, 12),
      expect.closeTo(0.5, 12),
      expect.closeTo(0.375, 12),
    ])
  })

  it('rejects forged or mismatched plans before execution', () => {
    const canonicalDamages = [createEnvelope({ values: [1] })]
    const plan = planCanonicalDamageAggregation(canonicalDamages)
    const forgedPlan = { ...plan, estimates: { ...plan.estimates } }

    expectAggregationError(
      () => sumCanonicalDamage(canonicalDamages, { plan: forgedPlan }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS
    )
    expectAggregationError(
      () => sumCanonicalDamage([...canonicalDamages], { plan }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS
    )
  })

  it('rejects invalid options with a typed code', () => {
    expectAggregationError(
      () => sumCanonicalDamage([], null),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS
    )
    expectAggregationError(
      () => sumCanonicalDamage([], {
        maxFftLength: CANONICAL_DAMAGE_AGGREGATION_MAX_FFT_LENGTH + 1,
      }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS
    )
    for (const optionName of [
      'maxArrayLength',
      'maxFFTLength',
      'fftLength',
      'maxBytes',
    ]) {
      expectAggregationError(
        () => sumCanonicalDamage([], { [optionName]: 1 }),
        CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS
      )
    }
    expectAggregationError(
      () => sumCanonicalDamage([], { unknownOption: 1 }),
      CANONICAL_DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS
    )
  })
})
