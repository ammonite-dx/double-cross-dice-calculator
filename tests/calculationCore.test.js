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
