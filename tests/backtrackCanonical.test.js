import { describe, expect, it, vi } from 'vitest'

import {
  calculateFinalEncroachment,
  calculateFinalEncroachmentCanonical,
} from '../src/calculation/BacktrackCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  getBacktrackDiceCounts,
  getBacktrackSupportMax,
} from '../src/domain/BacktrackRules'
import {
  getD10Distribution,
  registerD10Asset,
} from '../src/data/D10PrecomputedDataRepository'
import {
  getLivingdeadDistribution,
  registerLivingdeadAsset,
} from '../src/data/ReferencePrecomputedDataRepository'
import { createCalculationClient } from '../src/application/CalculationClient'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerLivingdeadAsset(livingdead)

const backtrackDependencies = { getD10Distribution, getLivingdeadDistribution }

function getFinalEncroachment(params, runtimeOptions = {}, backtrackRangePlan) {
  return calculateFinalEncroachment(
    params,
    backtrackDependencies,
    runtimeOptions,
    backtrackRangePlan
  )
}

function getFinalEncroachmentCanonical(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateFinalEncroachmentCanonical(
    params,
    backtrackDependencies,
    runtimeOptions,
    backtrackRangePlan
  )
}

const RESULT_KEYS = ['single', 'double', 'second']

function createBacktrackPlan(params) {
  return planCalculationRanges({
    operation: 'backtrack',
    canonicalBacktrack: true,
    backtrack: params,
  }).backtrack
}

function createLegacyBacktrackPlan(params) {
  return planCalculationRanges({
    operation: 'backtrack',
    backtrack: params,
  }).backtrack
}

function sumMass(result) {
  return result.values.reduce((sum, probability) => sum + probability, 0)
}

function expectRelativeProbability(actual, expected) {
  expect(actual).toBeGreaterThan(0)
  expect(Number.isFinite(actual)).toBe(true)
  expect(actual / expected).toBeCloseTo(1, 10)
}

function roundPercentage(probability) {
  const rounded = Math.round(probability * 1000) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

function summarizeCategories(result, nightmare) {
  const upperThresholds = nightmare
    ? [120, 100, 71, 51, 31]
    : [100, 71, 51, 31]
  const buckets = Array.from(
    { length: upperThresholds.length + 1 },
    () => 0
  )

  for (let index = 0; index < result.values.length; index += 1) {
    const finalEncroachment = result.offset + index
    const bucket = upperThresholds.findIndex((threshold, thresholdIndex) =>
      finalEncroachment >= threshold
      && (
        thresholdIndex === 0
        || finalEncroachment < upperThresholds[thresholdIndex - 1]
      )
    )
    const resolvedBucket = bucket >= 0 ? bucket : upperThresholds.length
    buckets[resolvedBucket] += result.values[index]
  }

  return buckets.map(roundPercentage)
}

function summarizeBinary(result) {
  let failure = 0
  let success = 0
  for (let index = 0; index < result.values.length; index += 1) {
    if (result.offset + index >= 100) {
      failure += result.values[index]
    } else {
      success += result.values[index]
    }
  }
  return [
    roundPercentage(failure),
    roundPercentage(success),
  ]
}

function summarizeLegacyShape(canonical, params) {
  const nightmare = params.dlois === '不死者・悪夢'
  return {
    single: summarizeCategories(canonical.single, nightmare),
    double: summarizeBinary(canonical.double),
    second: summarizeBinary(canonical.second),
  }
}

function expectLegacyShapeClose(actual, expected) {
  RESULT_KEYS.forEach((key) => {
    expect(actual[key]).toHaveLength(expected[key].length)
    actual[key].forEach((value, index) => {
      // Both sides use the existing 0.1 percentage-point presentation
      // rounding; tolerate one displayed unit at the comparison boundary.
      expect(Math.abs(value - expected[key][index]))
        .toBeLessThanOrEqual(0.1)
    })
  })
}

function expectCanonicalResult(result, params, dice) {
  const base = params.encroachment - params.value
  const rawSupportMax = getBacktrackSupportMax(params.dlois, dice)
  const rawSupportMin = dice === 0 ? 0 : dice
  const expectedOffset = base - rawSupportMax
  const expectedSupportMax = base - rawSupportMin

  expect(result.values).toBeInstanceOf(Float64Array)
  expect(result.values).toHaveLength(rawSupportMax - rawSupportMin + 1)
  expect(result.offset).toBe(expectedOffset)
  expect(result.support).toEqual({
    kind: 'finite',
    max: expectedSupportMax,
  })
  expect(result.offset + result.values.length - 1)
    .toBeLessThanOrEqual(result.support.max)
  expect(result.offset + result.values.length - 1)
    .toBe(result.support.max)
  expect(result.overflow).toBeNull()
  expect(sumMass(result)).toBeCloseTo(1, 12)
  expect(result.values[0]).toBeGreaterThan(0)
  expect(result.values[result.values.length - 1]).toBeGreaterThan(0)
}

describe('backtrack canonical producer', () => {
  it.each([
    {
      name: 'ordinary D10 with fixed value',
      params: {
        encroachment: 79,
        lois: 1,
        elois: 0,
        dice: 1,
        value: 20,
        dlois: 'なし',
      },
    },
    {
      name: 'livingdead with fixed value',
      params: {
        encroachment: 142,
        lois: 0,
        elois: 0,
        dice: 4,
        value: 7,
        dlois: '屍人',
      },
    },
  ])('returns complete finite PMFs for $name', ({ params }) => {
    const plan = createBacktrackPlan(params)
    const canonical = calculateFinalEncroachmentCanonical(
      params,
      { getD10Distribution, getLivingdeadDistribution },
      {},
      plan
    )
    const diceCounts = getBacktrackDiceCounts(params)

    expect(Object.keys(canonical)).toEqual(RESULT_KEYS)
    RESULT_KEYS.forEach((key, index) => {
      expectCanonicalResult(canonical[key], params, diceCounts[index])
    })

    const legacy = getFinalEncroachment(params)
    const projectedCategories = summarizeLegacyShape(canonical, params)
    expectLegacyShapeClose(projectedCategories, legacy)
  })

  it('keeps negative final encroachment in a signed offset', () => {
    const params = {
      encroachment: 5,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 20,
      dlois: 'なし',
    }
    const plan = createBacktrackPlan(params)
    const canonical = calculateFinalEncroachmentCanonical(
      params,
      { getD10Distribution, getLivingdeadDistribution },
      {},
      plan
    )

    expect(canonical.single.offset).toBe(-25)
    expect(canonical.single.support).toEqual({ kind: 'finite', max: -16 })
    expect(Array.from(canonical.single.values)).not.toContain(0)
    expectCanonicalResult(canonical.single, params, 1)
  })

  it('generates complete ordinary support on demand beyond asset coverage', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: 'なし',
    }
    const plan = createBacktrackPlan(params)
    const getD10 = vi.fn(() => {
      throw new Error('ordinary asset must not be used')
    })
    const canonical = calculateFinalEncroachmentCanonical(
      params,
      { getD10Distribution: getD10 },
      {},
      plan
    )

    expect(plan.distributionMode).toBe('on-demand')
    expect(getD10).not.toHaveBeenCalled()
    expectCanonicalResult(canonical.single, params, 103)
  })

  it('keeps the ordinary D10 endpoint at d10[7] without using the sparse asset', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 7,
      value: 0,
      dlois: 'なし',
    }
    const plan = createBacktrackPlan(params)
    const getD10 = vi.fn(() => {
      throw new Error('ordinary asset must not be used by canonical backtrack')
    })
    const canonical = calculateFinalEncroachmentCanonical(
      params,
      { getD10Distribution: getD10 },
      {},
      plan
    )

    expect(plan.rawSupportMax).toBe(70)
    expect(plan.distributionMode).toBe('on-demand')
    expect(getD10).not.toHaveBeenCalled()
    expectCanonicalResult(canonical.single, params, 7)

    // The canonical PMF is reversed into final-encroachment coordinates:
    // index 0 is S=70 (all tens), and the last index is S=7 (all ones).
    // Each endpoint has one seven-die path, so both probabilities are 10^-7.
    expectRelativeProbability(canonical.single.values[0], 10 ** -7)
    expectRelativeProbability(canonical.single.values.at(-1), 10 ** -7)
  })

  it('always generates livingdead support on demand instead of using the sparse asset', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: '屍人',
    }
    const plan = createBacktrackPlan(params)
    const getLivingdead = vi.fn(() => {
      throw new Error('livingdead asset must not be used by canonical backtrack')
    })
    const canonical = calculateFinalEncroachmentCanonical(
      params,
      { getLivingdeadDistribution: getLivingdead },
      {},
      plan
    )

    expect(plan.distributionMode).toBe('on-demand')
    expect(getLivingdead).not.toHaveBeenCalled()
    expectCanonicalResult(canonical.single, params, 103)

    // The canonical PMF is reversed into final-encroachment coordinates:
    // index 0 is S=1021 (all tens), while the last index is S=103. The
    // S=103 endpoint has 1 all-ones path plus 103 * 9 paths with one die
    // in 2..10, for 928 paths in total.
    expectRelativeProbability(canonical.single.values[0], 10 ** -103)
    expectRelativeProbability(canonical.single.values.at(-1), 928 * 10 ** -103)
  })

  it('separates canonical memory overhead from the unchanged legacy plan', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 0,
      dlois: 'なし',
    }
    const plan = createBacktrackPlan(params)
    const legacyPlan = createLegacyBacktrackPlan(params)
    const canonicalBytes =
      3 * plan.workingLength * Float64Array.BYTES_PER_ELEMENT
    const legacyBytes =
      3 * legacyPlan.workingLength * Float64Array.BYTES_PER_ELEMENT

    expect(legacyPlan.distributionMode).toBe('asset')
    expect(legacyPlan.float64Bytes).toBe(legacyBytes)
    expect(legacyPlan.baseFloat64Bytes).toBeUndefined()
    expect(legacyPlan.canonicalResultFloat64Bytes).toBeUndefined()
    expect(plan.calculationMode).toBe('canonical')
    expect(plan.distributionMode).toBe('on-demand')
    expect(plan.canonicalResultFloat64Bytes).toBe(canonicalBytes)
    expect(plan.baseFloat64Bytes).toBe(
      5 * plan.workingLength * Float64Array.BYTES_PER_ELEMENT
    )
    expect(plan.float64Bytes).toBe(
      plan.baseFloat64Bytes + plan.canonicalResultFloat64Bytes
    )

    const memoryPolicy = {
      limits: {
        warning: { estimatedMemoryBytes: legacyBytes },
        hard: { estimatedMemoryBytes: legacyBytes },
      },
    }
    const legacyLimited = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    }, memoryPolicy)
    const canonicalLimited = planCalculationRanges({
      operation: 'backtrack',
      canonicalBacktrack: true,
      backtrack: params,
    }, memoryPolicy)
    expect(legacyLimited.accepted).toBe(true)
    expect(canonicalLimited.accepted).toBe(false)
    expect(canonicalLimited.rejectionReasons).toContain('estimated-memory')
  })

  it('exposes the canonical producer through the CalculationClient API', async () => {
    const client = createCalculationClient({
      getFinalEncroachmentCanonical,
    })
    const params = {
      encroachment: 79,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 20,
      dlois: 'なし',
    }

    const canonical = await client.calculateBacktrackCanonical(params)
    expect(canonical).toMatchObject({
      single: expect.objectContaining({ values: expect.any(Float64Array) }),
      double: expect.objectContaining({ values: expect.any(Float64Array) }),
      second: expect.objectContaining({ values: expect.any(Float64Array) }),
    })
  })
})
