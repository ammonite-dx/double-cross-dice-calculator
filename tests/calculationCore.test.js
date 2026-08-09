import { describe, expect, it, vi } from 'vitest'

import {
  calculateFinalEncroachment,
  calculateDamage,
  calculateScore,
} from '../src/calculation'
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
})
