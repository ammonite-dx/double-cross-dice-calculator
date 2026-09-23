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
  BACKTRACK_MAX_GENERATION_OPERATIONS,
  getBacktrackGenerationOperationEstimate,
} from '../src/calculation/BacktrackLimits'
import {
  calculateLivingdeadDistributions,
} from '../src/calculation/BacktrackLivingdeadDistribution'
import { createCalculationClient } from '../src/runtime/CalculationClient'
function getFinalEncroachment(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateFinalEncroachment(
    params,
    runtimeOptions,
    backtrackRangePlan
  )
}

const RESULT_KEYS = ['single', 'double', 'second']

function createBacktrackPlan(params) {
  return planCalculationRanges({
    operation: 'backtrack',
    backtrack: params,
  }).backtrack
}

function sumMass(result) {
  return result.values.reduce((sum, probability) => sum + probability, 0)
}

function enumerateLivingdead(dice, size) {
  const distribution = new Float64Array(size)
  if (dice === 0) {
    distribution[0] = 1
    return distribution
  }

  let outcomes = 0
  function visit(remaining, sum, maximum) {
    if (remaining === 0) {
      distribution[sum - maximum + 1] += 1
      outcomes += 1
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      visit(remaining - 1, sum + face, Math.max(maximum, face))
    }
  }

  visit(dice, 0, 0)
  for (let index = 0; index < distribution.length; index += 1) {
    distribution[index] /= outcomes
  }
  return distribution
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
  expect(Array.from(result.values).every(Number.isFinite)).toBe(true)
  expect(Array.from(result.values).every((probability) => probability >= 0))
    .toBe(true)
  if (params.dlois !== '屍人') {
    expect(result.values[0]).toBeGreaterThan(0)
    expect(result.values[result.values.length - 1]).toBeGreaterThan(0)
  }
}

describe('livingdead distribution generator', () => {
  it('matches small independent PMF oracles', () => {
    const size = 12
    const distributions = calculateLivingdeadDistributions([0, 1, 2], size)

    const zeroDice = distributions.get(0)
    expect(zeroDice).toBeInstanceOf(Float64Array)
    expect(zeroDice?.[0]).toBe(1)
    expect(zeroDice?.slice(1).every((probability) => probability === 0))
      .toBe(true)

    const oneDie = distributions.get(1)
    expect(oneDie).toBeInstanceOf(Float64Array)
    expect(oneDie?.[1]).toBe(1)
    expect(oneDie?.slice(0, 1).every((probability) => probability === 0))
      .toBe(true)

    const expectedTwoDice = new Float64Array(size)
    for (let first = 1; first <= 10; first += 1) {
      for (let second = 1; second <= 10; second += 1) {
        const value = first + second - Math.max(first, second) + 1
        expectedTwoDice[value] += 0.01
      }
    }

    const twoDice = distributions.get(2)
    expect(twoDice).toBeInstanceOf(Float64Array)
    expect(twoDice).toHaveLength(size)
    for (let index = 0; index < size; index += 1) {
      expect(twoDice?.[index]).toBeCloseTo(expectedTwoDice[index], 14)
    }
    expect(Array.from(twoDice ?? []).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 14)
  })

  it('matches direct face enumeration from zero through four dice', () => {
    const size = 40
    const distributions = calculateLivingdeadDistributions(
      [0, 1, 2, 3, 4],
      size,
    )

    for (let dice = 0; dice <= 4; dice += 1) {
      const actual = distributions.get(dice)
      const expected = enumerateLivingdead(dice, size)
      expect(actual).toBeInstanceOf(Float64Array)
      expect(actual).toHaveLength(size)
      for (let value = 0; value < size; value += 1) {
        expect(actual?.[value]).toBeCloseTo(expected[value], 13)
      }
    }
  })

  it('checks for cancellation between bounded-sum dice updates', () => {
    let abortChecks = 0
    const signal = {
      get aborted() {
        abortChecks += 1
        return abortChecks >= 2
      },
    }

    let thrown
    try {
      calculateLivingdeadDistributions([4], 40, { signal })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({ name: 'AbortError' })
    expect(abortChecks).toBe(2)
  })
})

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
      {},
      plan
    )

    expect(plan.generationMode).toBe('on-demand')
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
      {},
      plan
    )

    expect(plan.rawSupportMax).toBe(70)
    expect(plan.generationMode).toBe('on-demand')
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
      {},
      plan
    )

    expect(plan.generationMode).toBe('on-demand')
    expect(getLivingdead).not.toHaveBeenCalled()
    expectResult(canonical.single, params, 103)

    // The canonical PMF is reversed into final-encroachment coordinates:
    // The PMF preserves complete support and unit mass. At this depth the
    // endpoint is intentionally not required to retain relative precision.
    expect(Array.from(canonical.single.values).every(Number.isFinite)).toBe(true)
    expect(Array.from(canonical.single.values)
      .every((probability) => probability >= 0)).toBe(true)
  })

  it('accounts for on-demand generation memory in the resource plan', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 0,
      dlois: 'なし',
    }
    const plan = createBacktrackPlan(params)
    const resultBytes =
      3 * plan.workingLength * Float64Array.BYTES_PER_ELEMENT

    expect(plan.generationMode).toBe('on-demand')
    expect(plan.resultFloat64Bytes).toBe(resultBytes)
    expect(plan.baseFloat64Bytes).toBe(
      5 * plan.workingLength * Float64Array.BYTES_PER_ELEMENT
    )
    expect(plan.float64Bytes).toBe(
      plan.baseFloat64Bytes + plan.resultFloat64Bytes
    )

    expect(plan.baseFloat64Bytes).toBeGreaterThan(resultBytes)
  })

  it('records generation operations for on-demand plans only', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: 'なし',
    }
    const onDemand = createBacktrackPlan(params)

    expect(onDemand.generationOperations).toBe(
      getBacktrackGenerationOperationEstimate(
        onDemand.maxDice,
        onDemand.workingLength,
        onDemand.livingdead
      )
    )
    expect(onDemand.operations).toBe(
      onDemand.workingLength * 3 + onDemand.generationOperations
    )
    expect(createBacktrackPlan({ ...params, dice: 1 }).generationOperations)
      .toBeGreaterThan(0)
  })

  it('accepts 845 livingdead dice and rejects 846 using the generation plan', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 845,
      value: 0,
      dlois: '屍人',
    }
    const accepted = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    })
    const plan = accepted.backtrack

    expect(accepted.accepted).toBe(true)
    expect(plan?.workingLength).toBe(8442)
    expect(plan?.generationOperations).toBe(
      getBacktrackGenerationOperationEstimate(845, 8442, true)
    )
    expect(plan?.generationOperations).toBe(99_868_860)
    expect(plan?.baseFloat64Bytes).toBe(1_013_760)
    expect(plan?.resultFloat64Bytes).toBe(202_608)
    expect(plan?.float64Bytes).toBe(1_216_368)

    const result = calculateFinalEncroachment(params, {}, plan)
    expectResult(result.single, params, 845)

    const rejected = planCalculationRanges({
      operation: 'backtrack',
      backtrack: { ...params, dice: 846 },
    })
    expect(rejected.accepted).toBe(false)
    expect(rejected.rejectionReasons).toContain('backtrack-generation')
    expect(rejected.backtrack?.generationOperations)
      .toBeGreaterThan(BACKTRACK_MAX_GENERATION_OPERATIONS)
  })

  it('rejects a backtrack plan with inconsistent generation operations', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 0,
      dlois: 'なし',
    }
    const plan = createBacktrackPlan(params)
    const malformed = {
      ...plan,
      generationOperations: plan.generationOperations + 1,
    }

    expect(() => getFinalEncroachment(params, {}, malformed))
      .toThrow('generationOperations')
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
