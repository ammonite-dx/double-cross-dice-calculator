import { describe, expect, it, vi } from 'vitest'

import {
  calculateFinalEncroachmentCanonical,
} from '../src/calculation/BacktrackCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  getBacktrackDiceCounts,
  getBacktrackSupportMax,
} from '../src/domain/BacktrackRules'
import {
  getD10Distribution,
  getLivingdeadDistribution,
  registerD10Asset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import {
  getFinalEncroachment,
  getFinalEncroachmentCanonical,
} from '../src/data/BacktrackCalculator'
import { createCalculationClient } from '../src/application/CalculationClient'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerLivingdeadAsset(livingdead)

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

  it('exposes the producer through the explicit client API without changing legacy output', async () => {
    const client = createCalculationClient({
      getFinalEncroachment,
      getFinalEncroachmentCanonical,
      getScore: vi.fn(),
      loadD10Asset: vi.fn(async () => {}),
      loadLivingdeadAsset: vi.fn(async () => {}),
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
    const legacy = await client.calculateBacktrack(params)

    expectLegacyShapeClose(summarizeLegacyShape(canonical, params), legacy)
  })
})
