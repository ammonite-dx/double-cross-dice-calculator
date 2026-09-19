import { describe, expect, it } from 'vitest'

import {
  binomialSurvivalProbability,
  calculateDxOrderStatisticTail,
  getDxOrderStatisticTermCount,
} from '../src/calculation/DxOrderStatistic'
import {
  calculateDxDistribution,
} from '../src/calculation/DxCalculator'
import { oneDieTail } from '../src/calculation/DxTailModel'

function choose(n, k) {
  if (k < 0 || k > n) {
    return 0
  }
  let result = 1
  for (let index = 1; index <= Math.min(k, n - k); index += 1) {
    result = result * (n - index + 1) / index
  }
  return result
}

function binomialTailOracle(n, required, probability) {
  let result = 0
  for (let successes = required; successes <= n; successes += 1) {
    result += choose(n, successes) *
      probability ** successes *
      (1 - probability) ** (n - successes)
  }
  return result
}

describe('DX order-statistic helpers', () => {
  it('handles maximum and minimum order-statistic boundaries', () => {
    const probability = 0.37
    expect(binomialSurvivalProbability(7, 1, probability))
      .toBeCloseTo(1 - (1 - probability) ** 7, 14)
    expect(binomialSurvivalProbability(7, 7, probability))
      .toBeCloseTo(probability ** 7, 14)
    expect(getDxOrderStatisticTermCount(7, 0)).toBe(1)
    expect(getDxOrderStatisticTermCount(7, 6)).toBe(1)
    expect(getDxOrderStatisticTermCount(7, 3)).toBe(4)
  })

  it('matches an independent binomial enumeration for small ranks', () => {
    for (let dice = 1; dice <= 8; dice += 1) {
      for (let shihai = 0; shihai < dice; shihai += 1) {
        for (const probability of [0.1, 0.37, 0.8]) {
          const actual = binomialSurvivalProbability(
            dice,
            shihai + 1,
            probability
          )
          const expected = binomialTailOracle(
            dice,
            shihai + 1,
            probability
          )
          expect(actual).toBeCloseTo(expected, 13)
        }
      }
    }
  })

  it('handles probability endpoints and rejects non-finite inputs', () => {
    expect(binomialSurvivalProbability(5, 3, 0)).toBe(0)
    expect(binomialSurvivalProbability(5, 3, 1)).toBe(1)
    expect(binomialSurvivalProbability(5, 0, 0.5)).toBe(1)
    expect(binomialSurvivalProbability(5, 6, 0.5)).toBe(0)
    expect(() => binomialSurvivalProbability(5, 3, Number.NaN)).toThrow()
    expect(() => binomialSurvivalProbability(5, 3, Infinity)).toThrow()
  })

  it('is monotone as shihai discards more large results', () => {
    const tails = []
    for (let shihai = 0; shihai < 8; shihai += 1) {
      tails.push(calculateDxOrderStatisticTail(12, 8, 7, shihai))
    }
    for (let index = 1; index < tails.length; index += 1) {
      expect(tails[index]).toBeLessThanOrEqual(tails[index - 1] + 1e-14)
    }
  })

  it('matches the PMF and overflow boundary of the producer', () => {
    const workingLength = 32
    const params = { dice: 6, critical: 8, shihai: 2, yousei: 0 }
    const distribution = calculateDxDistribution(params, { workingLength })
    let total = 0
    for (const probability of distribution) {
      total += probability
    }
    expect(total).toBeCloseTo(1, 13)

    const overflowTail = calculateDxOrderStatisticTail(
      workingLength - 2,
      params.dice,
      params.critical,
      params.shihai
    )
    expect(distribution.at(-1)).toBeCloseTo(overflowTail, 13)
    for (let value = 1; value < workingLength - 1; value += 1) {
      const previous = calculateDxOrderStatisticTail(
        value - 1,
        params.dice,
        params.critical,
        params.shihai
      )
      const current = calculateDxOrderStatisticTail(
        value,
        params.dice,
        params.critical,
        params.shihai
      )
      expect(distribution[value]).toBeCloseTo(previous - current, 13)
    }
  })

  it('accepts a million-dice finite-support request with constant working memory', () => {
    const distribution = calculateDxDistribution({
      dice: 1_000_000,
      critical: 11,
      shihai: 1,
      yousei: 0,
    }, { workingLength: 12 })

    expect(distribution).toHaveLength(12)
    expect(distribution[10]).toBeGreaterThan(0)
    expect(distribution.at(-1)).toBe(0)
    expect(Array.from(distribution).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 14)
  })

  it('uses complete 1DX tails for the production order statistic', () => {
    const value = 17
    const critical = 8
    const probability = oneDieTail(value, critical)
    expect(calculateDxOrderStatisticTail(value, 5, critical, 2))
      .toBeCloseTo(binomialSurvivalProbability(5, 3, probability), 14)
  })
})
