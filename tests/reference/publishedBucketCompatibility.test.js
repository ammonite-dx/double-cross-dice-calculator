import { describe, expect, it } from 'vitest'

import {
  DISTRIBUTION_RESULT_ERROR_CODES,
  DistributionResultError,
  createDistributionResult,
  getExplicitMax,
} from '../../src/calculation/DistributionResult'
import {
  PUBLISHED_BUCKET_ERROR_CODES,
  PUBLISHED_BUCKET_LENGTH,
  PUBLISHED_OVERFLOW_INDEX,
  fromPublishedBucketDistribution,
  isDistributionResultAdapterError,
  toPublishedBucketDistribution,
} from '../../tooling/reference-data/PublishedBucketCompatibility'

function expectTypedError(callback, code) {
  let error
  try {
    callback()
  } catch (caught) {
    error = caught
  }

  expect(error instanceof DistributionResultError || error?.adapter === true).toBe(true)
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

describe('published bucket distribution adapters', () => {
  it('requires explicit support and maps index 1023 to exact overflow', () => {
    const legacy = new Float64Array(PUBLISHED_BUCKET_LENGTH)
    legacy[0] = 0.2
    legacy[10] = 0.3
    legacy[1022] = 0.1
    legacy[PUBLISHED_OVERFLOW_INDEX] = 0.4

    const result = fromPublishedBucketDistribution(legacy, {
      support: { kind: 'infinite' },
    })

    expect(result.values.length).toBe(PUBLISHED_OVERFLOW_INDEX)
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
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_SUPPORT_REQUIRED
    )
  })

  it('round-trips finite and infinite legacy support without treating the tail as a normal value', () => {
    const legacy = Array(PUBLISHED_BUCKET_LENGTH).fill(0)
    legacy[1] = 0.2
    legacy[1023] = 0.8

    const finite = fromPublishedBucketDistribution(legacy, {
      support: { kind: 'finite', max: 2048 },
    })
    const infinite = fromPublishedBucketDistribution(legacy, {
      support: { kind: 'infinite' },
    })
    const finiteWithoutTail = Array(PUBLISHED_BUCKET_LENGTH).fill(0)
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
      PUBLISHED_BUCKET_ERROR_CODES.UNSAFE_PROJECTION
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
      PUBLISHED_BUCKET_ERROR_CODES.UPPER_BOUND_PROJECTION
    )
    expect(isDistributionResultAdapterError(upperBoundError)).toBe(true)
    expectTypedError(
      () => toPublishedBucketDistribution(missingIndividualValues, { length: 1024 }),
      PUBLISHED_BUCKET_ERROR_CODES.UNSAFE_PROJECTION
    )
  })

  it('rejects exact potential mass below 1023 even when the explicit range is complete, but permits inert overflow', () => {
    const values = new Float64Array(PUBLISHED_OVERFLOW_INDEX)
    values[0] = 0.4
    const unsafeResult = createExactResult({
      values,
      support: { kind: 'infinite' },
      lowerBound: 1000,
      probability: 0.6,
    })

    expectTypedError(
      () => toPublishedBucketDistribution(unsafeResult, { length: 1024 }),
      PUBLISHED_BUCKET_ERROR_CODES.UNSAFE_PROJECTION
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
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_LENGTH
    )
    const nanLegacy = new Float64Array(PUBLISHED_BUCKET_LENGTH)
    nanLegacy[0] = Number.NaN
    expectTypedError(
      () => fromPublishedBucketDistribution(nanLegacy, {
        support: { kind: 'infinite' },
      }),
      DISTRIBUTION_RESULT_ERROR_CODES.NON_FINITE_PROBABILITY
    )
    const negativeLegacy = new Float64Array(PUBLISHED_BUCKET_LENGTH)
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
      PUBLISHED_BUCKET_ERROR_CODES.LEGACY_LENGTH_OPTION
    )
  })
})
