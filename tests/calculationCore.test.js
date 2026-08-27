import { describe, expect, it, vi } from 'vitest'

import {
  calculateD10Distributions,
  calculateLivingdeadDistributions,
  calculateFinalEncroachment,
} from '../src/calculation/BacktrackCalculator'
import { BACKTRACK_MAX_GENERATION_LENGTH } from '../src/calculation/BacktrackLimits'
import { calculateDamage } from '../src/calculation/DamageCalculator'
import { calculateScore } from '../src/calculation/ScoreCalculator'
import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
} from '../src/data/Distribution'
import {
  getConvolutionFftLength,
} from '../src/data/FFT'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

function pointDistribution(value, size = OUTPUT_DISTRIBUTION_SIZE) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

function enumerateD10(dice) {
  const distribution = Array(10 * dice + 1).fill(0)
  const outcomes = 10 ** dice
  const visit = (index, sum) => {
    if (index === dice) {
      distribution[sum] += 1 / outcomes
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      visit(index + 1, sum + face)
    }
  }
  visit(0, 0)
  return distribution
}

function enumerateLivingdead(dice) {
  if (dice === 0) {
    return [1]
  }
  const distribution = Array(10 * dice - 8).fill(0)
  const rolls = []
  const outcomes = 10 ** dice
  const visit = (index, sum) => {
    if (index === dice) {
      const value = sum - Math.max(...rolls) + 1
      distribution[value] += 1 / outcomes
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      rolls.push(face)
      visit(index + 1, sum + face)
      rolls.pop()
    }
  }
  visit(0, 0)
  return distribution
}

function expectDistributionMatches(actual, expected) {
  expect(actual).toHaveLength(expected.length)
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 12)
    expect(actual[index]).toBeGreaterThanOrEqual(0)
  }
  expect(actual.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
}

describe('calculation core', () => {
  it('calculates a score with an injected distribution provider', () => {
    const getDistribution = vi.fn(() => ({
      offset: 5,
      values: [1],
    }))

    const result = calculateScore({
      dice: 1,
      critical: 10,
      skill: 2,
      yousei: 0,
      shihai: 0,
    }, { getDxDistribution: getDistribution })

    expect(getDistribution).toHaveBeenCalledWith(0, 1, 10)
    expect(result.distribution[7]).toBe(1)
    expect(result.failureProbability).toBe(0)
  })

  it('accepts the dense Float64Array returned by runtime DX calculation', () => {
    const distribution = new Float64Array(WORKING_DISTRIBUTION_SIZE)
    distribution[5] = 1
    const getDistribution = vi.fn(() => distribution)

    const result = calculateScore({
      dice: 1,
      critical: 10,
      skill: 2,
      yousei: 0,
      shihai: 0,
    }, { getDxDistribution: getDistribution })

    expect(result.distribution[7]).toBe(1)
    expect(result.failureProbability).toBe(0)
  })

  it('uses a score plan to request the same unrounded working length', () => {
    const params = {
      dice: 99,
      critical: 2,
      skill: 0,
      yousei: 9,
      shihai: 0,
    }
    const plan = planCalculationRanges({
      operation: 'score',
      score: params,
    }).scores[0]
    const getDistribution = vi.fn((shihai, dice, critical, options) =>
      calculateDxDistribution({ dice, critical, shihai }, options)
    )

    const result = calculateScore(
      params,
      { getDxDistribution: getDistribution },
      false,
      plan
    )

    expect(plan.workingLength).toBe(4173)
    expect(plan.fftLength).toBe(getConvolutionFftLength(plan.workingLength))
    expect(result.distribution).toHaveLength(OUTPUT_DISTRIBUTION_SIZE)
    expect(getDistribution).toHaveBeenCalledTimes(2)
    for (const call of getDistribution.mock.calls) {
      expect(call[3]).toEqual({
        workingLength: plan.workingLength,
        rounding: 'unrounded',
      })
      expect(call[0] === 0 || call[0] === params.shihai).toBe(true)
    }
  })

  it('rejects a dense DX provider result with the wrong planned length', () => {
    const plan = { workingLength: 8, fftLength: 0 }
    const getDistribution = vi.fn(() => new Float64Array(7))

    expect(() => calculateScore(
      {
        dice: 1,
        critical: 10,
        skill: 0,
        yousei: 0,
        shihai: 0,
      },
      { getDxDistribution: getDistribution },
      false,
      plan
    )).toThrow('DX distribution length')
  })

  it('rejects a dense yousei provider result with the wrong planned length', () => {
    const plan = {
      workingLength: 8,
      fftLength: getConvolutionFftLength(8),
    }
    let callCount = 0
    const getDistribution = vi.fn(() => {
      callCount += 1
      const distribution = new Float64Array(callCount === 1 ? 8 : 7)
      distribution[0] = 1
      return distribution
    })

    expect(() => calculateScore(
      {
        dice: 1,
        critical: 10,
        skill: 0,
        yousei: 1,
        shihai: 0,
      },
      { getDxDistribution: getDistribution },
      false,
      plan
    )).toThrow('yousei distribution length')
  })

  it('requires separate explicit and overflow buckets in a score plan', () => {
    expect(() => calculateScore(
      {
        dice: 0,
        critical: 11,
        skill: 0,
        yousei: 0,
        shihai: 0,
      },
      { getDxDistribution: vi.fn() },
      false,
      { workingLength: 1, fftLength: 0 }
    )).toThrow('workingLength must be at least 2')
  })

  it('keeps fixed scores independent of the dynamic DX provider', () => {
    const getDistribution = vi.fn()
    const result = calculateScore(
      {
        dice: 99,
        critical: 2,
        skill: 999,
        yousei: 9,
        shihai: 19,
      },
      { getDxDistribution: getDistribution },
      true,
      { workingLength: 4173, fftLength: 16384 }
    )

    expect(result.distribution[999]).toBe(1)
    expect(getDistribution).not.toHaveBeenCalled()
  })

  it.each([
    { dice: 99, critical: 2, skill: -999, yousei: 0, shihai: 0 },
    { dice: 99, critical: 2, skill: 999, yousei: 0, shihai: 0 },
    { dice: 99, critical: 2, skill: -999, yousei: 9, shihai: 0 },
  ])('keeps planned score output bounded for %o', (params) => {
    const plan = planCalculationRanges({
      operation: 'score',
      score: params,
    }).scores[0]
    const result = calculateScore(
      params,
      {
        getDxDistribution: (shihai, dice, critical, options) =>
          calculateDxDistribution({ dice, critical, shihai }, options),
      },
      false,
      plan
    )

    expect(result.distribution).toHaveLength(OUTPUT_DISTRIBUTION_SIZE)
    expect(result.failureProbability).toBeGreaterThanOrEqual(0)
    expect(result.failureProbability).toBeLessThanOrEqual(1)
    expect(result.distribution.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 12)
  })

  it('keeps the dynamic DX overflow bucket inside the tail certificate', () => {
    const params = {
      dice: 99,
      critical: 2,
      skill: -7,
      yousei: 0,
      shihai: 0,
    }
    const plan = planCalculationRanges({
      operation: 'score',
      score: params,
    }).scores[0]
    const distribution = calculateDxDistribution(params, {
      workingLength: plan.workingLength,
      rounding: 'unrounded',
    })

    expect(distribution.at(-1)).toBeLessThanOrEqual(plan.tail.bound + 1e-12)
  })

  it('calculates damage with injected damage-roll providers', () => {
    const damageRollDistributions = Array.from(
      { length: WORKING_DISTRIBUTION_SIZE },
      (_, damage) => {
        const probabilitiesByDice = []
        probabilitiesByDice[2] = damage === 7 ? 1 : 0
        return probabilitiesByDice
      }
    )
    const getDrDamageDistributions = vi.fn(
      () => damageRollDistributions
    )
    const getD10Distribution = vi.fn(() => {
      throw new Error('defence dice should not be requested')
    })
    const score = {
      action: {
        distribution: pointDistribution(10),
      },
      reaction: {
        upperTailProbability: Array(OUTPUT_DISTRIBUTION_SIZE).fill(0),
      },
    }

    const result = calculateDamage(
      score,
      { dice: 0, value: 0, kazanari: 4 },
      { dice: 0, value: 0 },
      { getD10Distribution, getDrDamageDistributions }
    )

    expect(getDrDamageDistributions).toHaveBeenCalledWith(4)
    expect(getD10Distribution).not.toHaveBeenCalled()
    expect(result.distribution[7]).toBe(1)
  })

  it('calculates backtrack results with an injected provider', () => {
    const getD10Distribution = vi.fn(() => pointDistribution(0))
    const getLivingdeadDistribution = vi.fn(() => {
      throw new Error('livingdead data should not be requested')
    })

    const result = calculateFinalEncroachment({
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 0,
      value: 0,
      dlois: 'なし',
    }, { getD10Distribution, getLivingdeadDistribution })

    expect(getD10Distribution).toHaveBeenNthCalledWith(1, 0)
    expect(getD10Distribution).toHaveBeenNthCalledWith(2, 0)
    expect(getD10Distribution).toHaveBeenNthCalledWith(3, 0)
    expect(getLivingdeadDistribution).not.toHaveBeenCalled()
    expect(result.single).toEqual([100, 0, 0, 0, 0])
  })

  it('generates complete ordinary D10 support for planned backtrack ranges', () => {
    const distributions = calculateD10Distributions([0, 2, 103], 1031)

    expect(distributions.get(0)[0]).toBe(1)
    expect(distributions.get(2)[2]).toBeCloseTo(0.01, 12)
    expect(distributions.get(2)[20]).toBeCloseTo(0.01, 12)
    expect(distributions.get(103)).toHaveLength(1031)
    expect(distributions.get(103).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 12)
    expect(distributions.get(103)[1030]).toBeGreaterThan(0)
  })

  it('generates the livingdead sum-minus-maximum distribution', () => {
    const distributions = calculateLivingdeadDistributions([1, 2], 21)
    const twoDice = distributions.get(2)

    expect(Array.from(twoDice.slice(2, 12))).toEqual([
      0.19,
      0.17,
      0.15,
      0.13,
      0.11,
      0.09,
      0.07,
      0.05,
      0.03,
      0.01,
    ].map((value) => expect.closeTo(value, 1e-12)))
    expect(twoDice.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 12)
  })

  it.each([0, 1, 2, 3, 4])(
    'matches independent full enumeration for ordinary and livingdead dice=%i',
    (dice) => {
      const ordinaryExpected = enumerateD10(dice)
      const ordinaryActual = calculateD10Distributions(
        [dice],
        ordinaryExpected.length
      ).get(dice)
      expectDistributionMatches(ordinaryActual, ordinaryExpected)

      const livingdeadExpected = enumerateLivingdead(dice)
      const livingdeadActual = calculateLivingdeadDistributions(
        [dice],
        livingdeadExpected.length
      ).get(dice)
      expectDistributionMatches(livingdeadActual, livingdeadExpected)
    }
  )

  it('uses complete planned support before applying backtrack thresholds', () => {
    const params = {
      encroachment: 1054,
      lois: 0,
      elois: 0,
      dice: 200,
      value: 0,
      dlois: 'なし',
    }
    const plan = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    })
    const getD10Distribution = vi.fn()
    const getLivingdeadDistribution = vi.fn()

    const result = calculateFinalEncroachment(
      params,
      { getD10Distribution, getLivingdeadDistribution },
      { signal: new AbortController().signal },
      plan.backtrack
    )

    expect(result.single.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(100, 10)
    expect(result.single[4]).toBeGreaterThan(0)
    expect(getD10Distribution).not.toHaveBeenCalled()
    expect(getLivingdeadDistribution).not.toHaveBeenCalled()
  })

  it('uses the livingdead rule for planned dynamic backtrack support', () => {
    const params = {
      encroachment: 1054,
      lois: 0,
      elois: 0,
      dice: 104,
      value: 0,
      dlois: '屍人',
    }
    const plan = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    })

    const result = calculateFinalEncroachment(
      params,
      {
        getD10Distribution: vi.fn(),
        getLivingdeadDistribution: vi.fn(),
      },
      {},
      plan.backtrack
    )

    expect(plan.backtrack.distributionMode).toBe('on-demand')
    expect(result.single.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(100, 10)
    expect(result.double.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(100, 10)
  })

  it('keeps the livingdead asset boundary exact at n=103', () => {
    const params = {
      encroachment: 1054,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: '\u5c4d\u4eba',
    }
    const plan = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    })
    const getLivingdeadDistribution = vi.fn((dice, size) =>
      pointDistribution(0, size)
    )

    calculateFinalEncroachment(
      params,
      {
        getD10Distribution: vi.fn(),
        getLivingdeadDistribution,
      },
      {},
      plan.backtrack
    )

    expect(plan.backtrack.rawSupportMax).toBe(1021)
    expect(plan.backtrack.workingLength).toBe(1022)
    expect(plan.backtrack.distributionMode).toBe('asset')
    expect(getLivingdeadDistribution).toHaveBeenCalledTimes(3)
    expect(getLivingdeadDistribution).toHaveBeenNthCalledWith(1, 103, 1022)
  })

  it('honors an aborted signal before planned backtrack generation', () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: 'なし',
    }
    const plan = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    })
    const controller = new AbortController()
    controller.abort()

    expect(() => calculateFinalEncroachment(
      params,
      {
        getD10Distribution: vi.fn(),
        getLivingdeadDistribution: vi.fn(),
      },
      { signal: controller.signal },
      plan.backtrack
    )).toThrow('aborted')
  })

  it('honors an already-aborted signal before n=0 allocation', () => {
    const controller = new AbortController()
    controller.abort()

    expect(() => calculateD10Distributions(
      [0],
      1,
      { signal: controller.signal }
    )).toThrow('aborted')
    expect(() => calculateLivingdeadDistributions(
      [0],
      1,
      { signal: controller.signal }
    )).toThrow('aborted')
  })

  it('checks abort during the ordinary and livingdead DP at chunk boundaries', () => {
    let ordinaryReads = 0
    const ordinarySignal = {
      get aborted() {
        ordinaryReads += 1
        return ordinaryReads >= 32
      },
    }
    expect(() => calculateD10Distributions(
      [103],
      1031,
      { signal: ordinarySignal }
    )).toThrow('aborted')

    let livingdeadReads = 0
    const livingdeadSignal = {
      get aborted() {
        livingdeadReads += 1
        return livingdeadReads >= 13
      },
    }
    expect(() => calculateLivingdeadDistributions(
      [103],
      1022,
      { signal: livingdeadSignal }
    )).toThrow('aborted')
  })

  it('rejects invalid input and absolute generation limits before allocation', () => {
    expect(() => calculateD10Distributions([-1], 1)).toThrow()
    expect(() => calculateD10Distributions([1.5], 11)).toThrow()
    expect(() => calculateD10Distributions([1], 11.5)).toThrow()
    expect(() => calculateD10Distributions([0], 0)).toThrow()
    expect(() => calculateD10Distributions(
      [Number.MAX_SAFE_INTEGER],
      1
    )).toThrow('absolute safety limit')
    expect(() => calculateD10Distributions(
      [0],
      BACKTRACK_MAX_GENERATION_LENGTH + 1
    )).toThrow('absolute safety limit')
    expect(() => calculateLivingdeadDistributions(
      [400],
      3992
    )).toThrow('absolute generation safety limit')
  })

  it('rejects invalid planned probability arrays', () => {
    const params = {
      encroachment: 100,
      lois: 1,
      elois: 0,
      dice: 0,
      value: 0,
      dlois: 'なし',
    }
    const plan = planCalculationRanges({
      operation: 'backtrack',
      backtrack: params,
    })
    const invalid = vi.fn(() => Array(plan.backtrack.workingLength).fill(0))

    expect(() => calculateFinalEncroachment(
      params,
      {
        getD10Distribution: invalid,
        getLivingdeadDistribution: vi.fn(),
      },
      {},
      plan.backtrack
    )).toThrow('probability total')
  })
})
