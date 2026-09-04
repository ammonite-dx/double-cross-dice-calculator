import { describe, expect, it, vi } from 'vitest'

import {
  calculateFinalEncroachment,
} from '../src/calculation/BacktrackCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  getBacktrackDiceCounts,
  getBacktrackSupportMax,
} from '../src/domain/BacktrackRules'
import {
  getLivingdeadDistribution,
  registerLivingdeadAsset,
} from '../tooling/reference-data/ReferencePrecomputedDataRepository'
import { calculateD10Distribution } from '../src/calculation/D10Calculator'
import { createCalculationClient } from '../src/runtime/CalculationClient'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerLivingdeadAsset(livingdead)

const getD10Distribution = (dice, size) =>
  calculateD10Distribution(dice, { size })
const backtrackDependencies = { getD10Distribution, getLivingdeadDistribution }

function getFinalEncroachment(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateFinalEncroachment(
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
    completeSupportBacktrack: true,
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

function expectResult(result, params, dice) {
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
    const canonical = calculateFinalEncroachment(
      params,
      { getD10Distribution, getLivingdeadDistribution },
      {},
      plan
    )
    const diceCounts = getBacktrackDiceCounts(params)

    expect(Object.keys(canonical)).toEqual(RESULT_KEYS)
    RESULT_KEYS.forEach((key, index) => {
      expectResult(canonical[key], params, diceCounts[index])
    })

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
    const canonical = calculateFinalEncroachment(
      params,
      { getD10Distribution, getLivingdeadDistribution },
      {},
      plan
    )

    expect(canonical.single.offset).toBe(-25)
    expect(canonical.single.support).toEqual({ kind: 'finite', max: -16 })
    expect(Array.from(canonical.single.values)).not.toContain(0)
    expectResult(canonical.single, params, 1)
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
    const canonical = calculateFinalEncroachment(
      params,
      { getD10Distribution: getD10 },
      {},
      plan
    )

    expect(plan.distributionMode).toBe('on-demand')
    expect(getD10).not.toHaveBeenCalled()
    expectResult(canonical.single, params, 103)
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
    const canonical = calculateFinalEncroachment(
      params,
      { getD10Distribution: getD10 },
      {},
      plan
    )

    expect(plan.rawSupportMax).toBe(70)
    expect(plan.distributionMode).toBe('on-demand')
    expect(getD10).not.toHaveBeenCalled()
    expectResult(canonical.single, params, 7)

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
    const canonical = calculateFinalEncroachment(
      params,
      { getLivingdeadDistribution: getLivingdead },
      {},
      plan
    )

    expect(plan.distributionMode).toBe('on-demand')
    expect(getLivingdead).not.toHaveBeenCalled()
    expectResult(canonical.single, params, 103)

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
    const resultBytes =
      3 * plan.workingLength * Float64Array.BYTES_PER_ELEMENT
    const legacyBytes =
      3 * legacyPlan.workingLength * Float64Array.BYTES_PER_ELEMENT

    expect(legacyPlan.distributionMode).toBe('asset')
    expect(legacyPlan.float64Bytes).toBe(legacyBytes)
    expect(legacyPlan.baseFloat64Bytes).toBeUndefined()
    expect(legacyPlan.resultFloat64Bytes).toBeUndefined()
    expect(plan.calculationMode).toBe('complete-support')
    expect(plan.distributionMode).toBe('on-demand')
    expect(plan.resultFloat64Bytes).toBe(resultBytes)
    expect(plan.baseFloat64Bytes).toBe(
      5 * plan.workingLength * Float64Array.BYTES_PER_ELEMENT
    )
    expect(plan.float64Bytes).toBe(
      plan.baseFloat64Bytes + plan.resultFloat64Bytes
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
    const Limited = planCalculationRanges({
      operation: 'backtrack',
      completeSupportBacktrack: true,
      backtrack: params,
    }, memoryPolicy)
    expect(legacyLimited.accepted).toBe(true)
    expect(Limited.accepted).toBe(false)
    expect(Limited.rejectionReasons).toContain('estimated-memory')
  })

  it('exposes the canonical producer through the CalculationClient API', async () => {
    const client = createCalculationClient({
      getFinalEncroachment,
    })
    const params = {
      encroachment: 79,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 20,
      dlois: 'なし',
    }

    const canonical = await client.calculateBacktrack(params)
    expect(canonical).toMatchObject({
      single: expect.objectContaining({ values: expect.any(Float64Array) }),
      double: expect.objectContaining({ values: expect.any(Float64Array) }),
      second: expect.objectContaining({ values: expect.any(Float64Array) }),
    })
  })
})
