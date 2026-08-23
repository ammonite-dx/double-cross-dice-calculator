import { describe, expect, it } from 'vitest'

import {
  DISTRIBUTION_RESULT_ERROR_CODES,
  DISTRIBUTION_RESULT_TOLERANCE,
  DistributionResultError,
  LEGACY_PUBLISHED_BUCKET_LENGTH,
  LEGACY_PUBLISHED_OVERFLOW_INDEX,
  copyDistributionValues,
  createDistributionResult,
  fromPublishedBucketDistribution,
  getExplicitMax,
  getCanonicalTotalDamageSummary,
  getExpectedValueSummary,
  getProbabilityMassSummary,
  isDistributionResultAdapterError,
  toPublishedBucketDistribution,
  validateDistributionResult,
} from '../src/calculation/DistributionResult'

function expectTypedError(callback, code) {
  let error
  try {
    callback()
  } catch (caught) {
    error = caught
  }

  expect(error).toBeInstanceOf(DistributionResultError)
  if (code !== undefined) {
    expect(error.code).toBe(code)
  }
  return error
}

function createExactResult({
  values,
  offset = 0,
  support = { kind: 'infinite' },
  lowerBound = 0,
  probability,
  errorBound = 0,
}) {
  const explicitValues = values instanceof Float64Array
    ? values
    : new Float64Array(values)
  const explicitMass = explicitValues.reduce((sum, value) => sum + value, 0)
  return createDistributionResult({
    values: explicitValues,
    offset,
    support,
    overflow: {
      kind: 'exact',
      lowerBound,
      probability: probability ?? 1 - explicitMass,
      errorBound,
    },
  })
}

describe('canonical distribution result', () => {
  it('copies factory input once, exposes the owned values buffer directly, and freezes metadata', () => {
    const input = new Float64Array([0.25, 0.75])
    const support = { kind: 'finite', max: 8 }
    const overflow = {
      kind: 'exact',
      lowerBound: 6,
      probability: 0,
      errorBound: 0,
    }
    const result = createDistributionResult({
      values: input,
      offset: 4,
      support,
      overflow,
    })

    input[0] = 1
    support.max = 1
    overflow.lowerBound = 100

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.support)).toBe(true)
    expect(Object.isFrozen(result.overflow)).toBe(true)
    const ownedValues = result.values
    expect(ownedValues).toBe(result.values)
    expect(ownedValues).toBeInstanceOf(Float64Array)
    expect(Array.from(ownedValues)).toEqual([0.25, 0.75])
    expect(result.support).toEqual({ kind: 'finite', max: 8 })
    expect(result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 6,
      probability: 0,
      errorBound: 0,
    })
    expect(getExplicitMax(result)).toBe(5)
    expect(validateDistributionResult(result)).toBe(true)

    const writableCopy = copyDistributionValues(result)
    writableCopy[0] = 1
    expect(result.values[0]).toBe(0.25)
  })

  it('derives explicitMax from offset and supports an empty explicit range', () => {
    const offsetResult = createDistributionResult({
      values: [0.2, 0.8],
      offset: 10,
      support: { kind: 'finite', max: 12 },
      overflow: null,
    })
    const emptyResult = createExactResult({
      values: [],
      support: { kind: 'infinite' },
      lowerBound: 0,
      probability: 1,
    })

    expect(getExplicitMax(offsetResult)).toBe(11)
    expect(getExplicitMax(emptyResult)).toBeNull()
    expect(emptyResult.values.length).toBe(0)
  })

  it('accepts signed finite offsets for canonical variables that can be negative', () => {
    const result = createDistributionResult({
      values: [1],
      offset: -4,
      support: { kind: 'finite', max: -4 },
      overflow: null,
    })

    expect(result.offset).toBe(-4)
    expect(result.support).toEqual({ kind: 'finite', max: -4 })
    expect(getExplicitMax(result)).toBe(-4)
    expect(getExpectedValueSummary(result)).toEqual({
      kind: 'exact',
      value: -4,
    })
    expect(validateDistributionResult(result)).toBe(true)
  })

  it('copies generic ArrayLike input into the canonical Float64Array', () => {
    const result = createDistributionResult(
      { 0: 0.2, 1: 0.8, length: 2 },
      { offset: 3, support: { kind: 'finite', max: 4 }, overflow: null }
    )

    expect(result.values).toBeInstanceOf(Float64Array)
    expect(Array.from(result.values)).toEqual([0.2, 0.8])
    expect(getExplicitMax(result)).toBe(4)
  })

  it('validates exact and upper-bound mass separately', () => {
    const exact = createExactResult({
      values: [0.4, 0.3],
      offset: 1,
      support: { kind: 'finite', max: 5 },
      lowerBound: 3,
      probability: 0.3,
      errorBound: 1e-12,
    })
    const upperBound = createDistributionResult({
      values: new Float64Array([0.4, 0.3]),
      offset: 1,
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 3,
        probabilityUpperBound: 0.31,
        errorBound: 2e-12,
      },
    })
    const noOverflow = createDistributionResult({
      values: [1],
      support: { kind: 'finite', max: 0 },
      overflow: null,
    })

    expect(getProbabilityMassSummary(exact)).toEqual({
      explicitMass: 0.7,
      overflowMass: 0.3,
      overflowMassUpperBound: 0.3,
      totalMass: 1,
      totalMassUpperBound: 1,
      unrepresentedMass: 0.3,
      unrepresentedMassUpperBound: 0.3,
      errorBound: 1e-12,
      isExact: true,
    })
    expect(getProbabilityMassSummary(upperBound)).toEqual({
      explicitMass: 0.7,
      overflowMass: null,
      overflowMassUpperBound: 0.31,
      totalMass: null,
      totalMassUpperBound: 1.01,
      unrepresentedMass: null,
      unrepresentedMassUpperBound: 0.31,
      errorBound: 2e-12,
      isExact: false,
    })
    expect(getProbabilityMassSummary(noOverflow)).toEqual({
      explicitMass: 1,
      overflowMass: null,
      overflowMassUpperBound: 0,
      totalMass: 1,
      totalMassUpperBound: 1,
      unrepresentedMass: 0,
      unrepresentedMassUpperBound: 0,
      errorBound: 0,
      isExact: true,
    })
  })

  it('summarizes exact values with offset included in the explicit first moment', () => {
    const result = createDistributionResult({
      values: [0.2, 0.8],
      offset: 10,
      support: { kind: 'infinite' },
      overflow: null,
    })

    expect(getExpectedValueSummary(result)).toEqual({
      kind: 'exact',
      value: 10.8,
    })

    const finiteResult = createDistributionResult({
      values: [0.25, 0.75],
      offset: 4,
      support: { kind: 'finite', max: 5 },
      overflow: null,
    })
    expect(getExpectedValueSummary(finiteResult)).toEqual({
      kind: 'exact',
      value: 4.75,
    })
  })

  it.each([
    {
      label: 'exact overflow with finite support',
      result: createExactResult({
        values: [0.75],
        offset: 2,
        support: { kind: 'finite', max: 8 },
        lowerBound: 4,
        probability: 0.25,
      }),
      expected: { kind: 'bounded', lowerBound: 2.5, upperBound: 3.5 },
    },
    {
      label: 'exact overflow with infinite support',
      result: createExactResult({
        values: [0.75],
        offset: 2,
        support: { kind: 'infinite' },
        lowerBound: 4,
        probability: 0.25,
      }),
      expected: { kind: 'lower-bound', lowerBound: 2.5 },
    },
    {
      label: 'exact overflow at one finite support point',
      result: createExactResult({
        values: [0.75],
        offset: 2,
        support: { kind: 'finite', max: 4 },
        lowerBound: 4,
        probability: 0.25,
      }),
      expected: { kind: 'exact', value: 2.5 },
    },
    {
      label: 'zero exact overflow with infinite support',
      result: createExactResult({
        values: [1],
        offset: 2,
        support: { kind: 'infinite' },
        lowerBound: 4,
        probability: 0,
        errorBound: 0.25,
      }),
      expected: { kind: 'exact', value: 2 },
    },
    {
      label: 'zero exact overflow with finite support',
      result: createExactResult({
        values: [1],
        offset: 2,
        support: { kind: 'finite', max: 4 },
        lowerBound: 4,
        probability: 0,
        errorBound: 0.25,
      }),
      expected: { kind: 'exact', value: 2 },
    },
  ])('summarizes $label without folding overflow into a point value', ({ result, expected }) => {
    expect(getExpectedValueSummary(result)).toEqual(expected)
  })

  it.each([
    {
      label: 'zero upper-bound overflow with finite support',
      result: createDistributionResult({
        values: [1],
        offset: 3,
        support: { kind: 'finite', max: 8 },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 5,
          probabilityUpperBound: 0,
          errorBound: 0.5,
        },
      }),
      expected: { kind: 'exact', value: 3 },
    },
    {
      label: 'zero upper-bound overflow with infinite support',
      result: createDistributionResult({
        values: [1],
        offset: 3,
        support: { kind: 'infinite' },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 5,
          probabilityUpperBound: 0,
          errorBound: 0.5,
        },
      }),
      expected: { kind: 'exact', value: 3 },
    },
    {
      label: 'upper-bound overflow with finite support',
      result: createDistributionResult({
        values: [0.5],
        offset: 1,
        support: { kind: 'finite', max: 6 },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 4,
          probabilityUpperBound: 0.5,
          errorBound: 0.75,
        },
      }),
      expected: { kind: 'bounded', lowerBound: 0.5, upperBound: 3.5 },
    },
    {
      label: 'upper-bound overflow with infinite support',
      result: createDistributionResult({
        values: [0.5],
        offset: 1,
        support: { kind: 'infinite' },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 4,
          probabilityUpperBound: 0.5,
          errorBound: 0.75,
        },
      }),
      expected: { kind: 'lower-bound', lowerBound: 0.5 },
    },
  ])('summarizes $label using its probability upper bound', ({ result, expected }) => {
    expect(getExpectedValueSummary(result)).toEqual(expected)
  })

  it('freezes summaries, propagates error metadata through mass, and leaves the result untouched', () => {
    const values = new Float64Array([0.75])
    const support = { kind: 'finite', max: 8 }
    const overflow = {
      kind: 'exact',
      lowerBound: 4,
      probability: 0.25,
      errorBound: 0.125,
    }
    const result = createDistributionResult({
      values,
      offset: 2,
      support,
      overflow,
    })
    const beforeValues = Array.from(result.values)
    const beforeSupport = { ...result.support }
    const beforeOverflow = { ...result.overflow }

    const expectedValue = getExpectedValueSummary(result)
    const mass = getProbabilityMassSummary(result)

    expect(Object.isFrozen(expectedValue)).toBe(true)
    expect(Object.isFrozen(mass)).toBe(true)
    expect(expectedValue).toEqual({
      kind: 'bounded',
      lowerBound: 2.5,
      upperBound: 3.5,
    })
    expect(mass.errorBound).toBe(0.125)
    expect(Array.from(result.values)).toEqual(beforeValues)
    expect(result.support).toEqual(beforeSupport)
    expect(result.overflow).toEqual(beforeOverflow)
    expect(result.values).not.toBe(values)
  })

  it('uses aggregate overflow lower probability for total expected-value bounds', () => {
    const result = createDistributionResult({
      values: [0.5, 0.5],
      offset: 2,
      support: { kind: 'finite', max: 20 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 10,
        probabilityUpperBound: 0.5,
        errorBound: 0.75,
      },
    })
    const summary = getCanonicalTotalDamageSummary({
      result,
      metadata: {
        modeledDistribution: true,
        aggregation: 'independent-sum',
        overflowProbabilityLowerBound: 0.2,
        sourceMassDrift: 0.4,
      },
    })

    expect(summary.expectedValue).toEqual({
      kind: 'bounded',
      lowerBound: 4.5,
      upperBound: 12.5,
    })
    expect(summary.mass.errorBound).toBe(0.75)
    expect(summary.expectedValue).not.toHaveProperty('errorBound')
  })

  it('does not invert expectation bounds within probability tolerance', () => {
    const result = createDistributionResult({
      values: [0.5],
      offset: 0,
      support: { kind: 'finite', max: 10 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 10,
        probabilityUpperBound: 0.5,
        errorBound: 0,
      },
    })

    expect(getCanonicalTotalDamageSummary({
      result,
      metadata: {
        modeledDistribution: true,
        overflowProbabilityLowerBound: 0.5 + 5e-13,
      },
    }).expectedValue).toEqual({
      kind: 'bounded',
      lowerBound: 5,
      upperBound: 5,
    })
  })

  it('retains aggregate lower expected value for infinite support', () => {
    const result = createDistributionResult({
      values: [0.5, 0.5],
      offset: 2,
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 10,
        probabilityUpperBound: 0.5,
        errorBound: 0,
      },
    })

    expect(getCanonicalTotalDamageSummary({
      result,
      metadata: {
        modeledDistribution: true,
        overflowProbabilityLowerBound: 0.2,
        errorBound: 99,
        sourceMassDrift: 99,
      },
    }).expectedValue).toEqual({
      kind: 'lower-bound',
      lowerBound: 4.5,
    })
  })

  it('keeps exact and null overflow on the existing expected-value semantics', () => {
    const exact = createDistributionResult({
      values: [0.75],
      offset: 2,
      support: { kind: 'finite', max: 8 },
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.25,
        errorBound: 0.5,
      },
    })
    const noOverflow = createDistributionResult({
      values: [0.25, 0.75],
      offset: 4,
      support: { kind: 'finite', max: 5 },
      overflow: null,
    })

    expect(getCanonicalTotalDamageSummary({
      result: exact,
      metadata: { modeledDistribution: true, overflowProbabilityLowerBound: 0 },
    }).expectedValue).toEqual(getExpectedValueSummary(exact))
    expect(getCanonicalTotalDamageSummary({
      result: noOverflow,
      metadata: { modeledDistribution: true },
    }).expectedValue).toEqual(getExpectedValueSummary(noOverflow))
  })

  it('rejects invalid canonical input before calculating an expected value', () => {
    expectTypedError(() => getExpectedValueSummary({}),
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_VERSION)
  })

  it('accepts finite support at explicitMax and finite support containing overflow lowerBound', () => {
    const noOverflow = createDistributionResult({
      values: [1],
      offset: 7,
      support: { kind: 'finite', max: 7 },
      overflow: null,
    })
    const boundedOverflow = createExactResult({
      values: [0.2],
      support: { kind: 'finite', max: 9 },
      lowerBound: 5,
      probability: 0.8,
    })

    expect(getExplicitMax(noOverflow)).toBe(7)
    expect(boundedOverflow.support.max).toBe(9)
  })

  it('rejects invalid schema numbers, discriminators, support, and mass', () => {
    expectTypedError(
      () => createDistributionResult({
        version: 2,
        values: [1],
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_VERSION
    )
    expectTypedError(
      () => createDistributionResult({
        values: [Number.NaN],
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY
    )
    expectTypedError(
      () => createDistributionResult({
        values: [-0.1],
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.NEGATIVE_PROBABILITY
    )
    expectTypedError(
      () => createDistributionResult({
        values: [1.1],
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.PROBABILITY_ABOVE_ONE
    )
    expectTypedError(
      () => createDistributionResult({
        values: [1],
        offset: Number.MAX_SAFE_INTEGER,
        support: { kind: 'finite', max: Number.MAX_SAFE_INTEGER },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.INDEX_OVERFLOW
    )
    expectTypedError(
      () => createDistributionResult({
        values: [0.5],
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.MASS_NOT_NORMALIZED
    )
    expectTypedError(
      () => createDistributionResult({
        values: [0.5],
        support: { kind: 'finite', max: 2 },
        overflow: {
          kind: 'exact',
          lowerBound: 1,
          probability: 0.4,
          errorBound: 0,
        },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.MASS_NOT_NORMALIZED
    )
    expectTypedError(
      () => createDistributionResult({
        values: [0.5],
        support: { kind: 'infinite' },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 1,
          probabilityUpperBound: 0.49,
          errorBound: 0,
        },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_TOO_SMALL
    )
    expectTypedError(
      () => createDistributionResult({
        values: [0.9],
        support: { kind: 'finite', max: 0 },
        overflow: {
          kind: 'exact',
          lowerBound: 1,
          probability: 0.1,
          errorBound: 0,
        },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.SUPPORT_BELOW_OVERFLOW
    )
    const inertOverflow = createDistributionResult({
      values: [1],
      support: { kind: 'finite', max: 0 },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0,
        errorBound: 0,
      },
    })
    expect(inertOverflow.support).toEqual({ kind: 'finite', max: 0 })
    expectTypedError(
      () => createDistributionResult({
        values: [1],
        support: { kind: 'infinite', max: 1 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SUPPORT
    )
    expectTypedError(
      () => createDistributionResult({
        values: [1],
        support: { kind: 'finite', max: 1 },
        overflow: {
          kind: 'exact',
          lowerBound: -1,
          probability: 0,
          errorBound: 0,
        },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_LOWER_BOUND
    )
    expectTypedError(
      () => createDistributionResult({
        values: [1],
        support: { kind: 'finite', max: 1 },
        overflow: {
          kind: 'exact',
          lowerBound: 1,
          probability: 0,
          errorBound: Number.NaN,
        },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_ERROR_BOUND
    )

    const storedExplicitMax = {
      version: 1,
      values: new Float64Array([1]),
      offset: 0,
      explicitMax: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    }
    expectTypedError(
      () => validateDistributionResult(storedExplicitMax),
      DISTRIBUTION_RESULT_ERROR_CODES.INVALID_SCHEMA
    )
  })

  it('uses the single mass tolerance at the boundary', () => {
    expect(() => createDistributionResult({
      values: [1 - DISTRIBUTION_RESULT_TOLERANCE / 2],
      support: { kind: 'finite', max: 0 },
      overflow: null,
    })).not.toThrow()
    expectTypedError(
      () => createDistributionResult({
        values: [1 - DISTRIBUTION_RESULT_TOLERANCE * 2],
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.MASS_NOT_NORMALIZED
    )
  })
})

describe('published bucket distribution adapters', () => {
  it('requires explicit support and maps index 1023 to exact overflow', () => {
    const legacy = new Float64Array(LEGACY_PUBLISHED_BUCKET_LENGTH)
    legacy[0] = 0.2
    legacy[10] = 0.3
    legacy[1022] = 0.1
    legacy[LEGACY_PUBLISHED_OVERFLOW_INDEX] = 0.4

    const result = fromPublishedBucketDistribution(legacy, {
      support: { kind: 'infinite' },
    })

    expect(result.values.length).toBe(LEGACY_PUBLISHED_OVERFLOW_INDEX)
    expect(result.offset).toBe(0)
    expect(getExplicitMax(result)).toBe(1022)
    expect(result.values[1022]).toBe(0.1)
    expect(result.overflow).toEqual({
      kind: 'exact',
      lowerBound: 1023,
      probability: 0.4,
      errorBound: 0,
    })
    expectTypedError(
      () => fromPublishedBucketDistribution(legacy),
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_SUPPORT_REQUIRED
    )
  })

  it('round-trips finite and infinite legacy support without treating the tail as a normal value', () => {
    const legacy = Array(LEGACY_PUBLISHED_BUCKET_LENGTH).fill(0)
    legacy[1] = 0.2
    legacy[1023] = 0.8

    const finite = fromPublishedBucketDistribution(legacy, {
      support: { kind: 'finite', max: 2048 },
    })
    const infinite = fromPublishedBucketDistribution(legacy, {
      support: { kind: 'infinite' },
    })
    const finiteWithoutTail = Array(LEGACY_PUBLISHED_BUCKET_LENGTH).fill(0)
    finiteWithoutTail[0] = 1
    const finiteNoOverflow = fromPublishedBucketDistribution(finiteWithoutTail, {
      support: { kind: 'finite', max: 1022 },
    })

    expect(Array.from(toPublishedBucketDistribution(finite, { length: 1024 })))
      .toEqual(legacy)
    expect(Array.from(toPublishedBucketDistribution(infinite)))
      .toEqual(legacy)
    expect(Array.from(toPublishedBucketDistribution(finiteNoOverflow)))
      .toEqual(finiteWithoutTail)
    expect(finite.support).toEqual({ kind: 'finite', max: 2048 })
    expect(infinite.support).toEqual({ kind: 'infinite' })
  })

  it('rejects projecting signed canonical values into non-negative legacy buckets', () => {
    const result = createDistributionResult({
      values: [1],
      offset: -1,
      support: { kind: 'finite', max: -1 },
      overflow: null,
    })

    expectTypedError(
      () => toPublishedBucketDistribution(result),
      DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION
    )
  })

  it('folds explicit values beyond 1022 and exact overflow into the final bucket', () => {
    const result = createExactResult({
      values: [0.2, 0.3],
      offset: 1022,
      support: { kind: 'finite', max: 2000 },
      lowerBound: 1023,
      probability: 0.5,
    })

    const published = toPublishedBucketDistribution(result, { length: 1024 })

    expect(published).toBeInstanceOf(Float64Array)
    expect(published[1022]).toBe(0.2)
    expect(published[1023]).toBeCloseTo(0.8, 12)
    expect(published.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
  })

  it('rejects upper-bound overflow and unsafe lower-bound projections', () => {
    const upperBound = createDistributionResult({
      values: [0.4],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1023,
        probabilityUpperBound: 0.6,
        errorBound: 0,
      },
    })
    const missingIndividualValues = createExactResult({
      values: Array.from({ length: 1000 }, (_, index) => index === 0 ? 0.4 : 0),
      support: { kind: 'infinite' },
      lowerBound: 1000,
      probability: 0.6,
    })

    const upperBoundError = expectTypedError(
      () => toPublishedBucketDistribution(upperBound, { length: 1024 }),
      DISTRIBUTION_RESULT_ERROR_CODES.UPPER_BOUND_PROJECTION
    )
    expect(isDistributionResultAdapterError(upperBoundError)).toBe(true)
    expectTypedError(
      () => toPublishedBucketDistribution(missingIndividualValues, { length: 1024 }),
      DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION
    )
  })

  it('rejects exact potential mass below 1023 even when the explicit range is complete, but permits inert overflow', () => {
    const values = new Float64Array(LEGACY_PUBLISHED_OVERFLOW_INDEX)
    values[0] = 0.4
    const unsafeResult = createExactResult({
      values,
      support: { kind: 'infinite' },
      lowerBound: 1000,
      probability: 0.6,
    })

    expectTypedError(
      () => toPublishedBucketDistribution(unsafeResult, { length: 1024 }),
      DISTRIBUTION_RESULT_ERROR_CODES.UNSAFE_PROJECTION
    )

    const inertResult = createDistributionResult({
      values: [1],
      support: { kind: 'finite', max: 0 },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0,
        errorBound: 0,
      },
    })
    const published = toPublishedBucketDistribution(inertResult, { length: 1024 })
    expect(published[0]).toBe(1)
    expect(published[1023]).toBe(0)
  })

  it('rejects non-1024 legacy lengths and invalid legacy probabilities', () => {
    expectTypedError(
      () => fromPublishedBucketDistribution(new Float64Array(1023), {
        support: { kind: 'infinite' },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH
    )
    const nanLegacy = new Float64Array(LEGACY_PUBLISHED_BUCKET_LENGTH)
    nanLegacy[0] = Number.NaN
    expectTypedError(
      () => fromPublishedBucketDistribution(nanLegacy, {
        support: { kind: 'infinite' },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY
    )
    const negativeLegacy = new Float64Array(LEGACY_PUBLISHED_BUCKET_LENGTH)
    negativeLegacy[0] = -0.1
    expectTypedError(
      () => fromPublishedBucketDistribution(negativeLegacy, {
        support: { kind: 'infinite' },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.NEGATIVE_PROBABILITY
    )
    expectTypedError(
      () => toPublishedBucketDistribution(
        createDistributionResult({
          values: [1],
          support: { kind: 'finite', max: 0 },
          overflow: null,
        }),
        { length: 1023 }
      ),
      DISTRIBUTION_RESULT_ERROR_CODES.LEGACY_LENGTH_OPTION
    )
  })
})
