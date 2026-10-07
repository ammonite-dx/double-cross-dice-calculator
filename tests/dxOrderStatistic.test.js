import { describe, expect, it } from 'vitest'

import {
  binomialSurvivalProbability,
  calculateDxOrderStatisticTail,
  getDxOrderStatisticOperationEstimate,
} from '../src/calculation/DxOrderStatistic'
import {
  getBinomialSurvivalIterationBudget,
  getBinomialSurvivalOperationEstimate,
} from '../src/calculation/BinomialSurvival'
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

  it('matches direct enumeration across a small parameter grid', () => {
    const probabilities = [1e-8, 0.1, 0.37, 0.5, 0.9, 1 - 1e-8]
    for (let dice = 1; dice <= 32; dice += 1) {
      for (let required = 1; required <= dice; required += 1) {
        for (const probability of probabilities) {
          const actual = binomialSurvivalProbability(dice, required, probability)
          const expected = binomialTailOracle(dice, required, probability)
          expect(actual).toBeCloseTo(expected, 12)
        }
      }
    }
  })

  it('matches independent large-parameter incomplete-beta reference values', () => {
    // Values generated with SciPy 1.18.0 scipy.special.betainc(a, b, q),
    // where a=required and b=dice-required+1. SciPy is not a test dependency.
    const cases = [
      [1_000_000, 500_001, 0.5, 0.49960105781933462],
      [100_000_000, 50_000_001, 0.5, 0.49996010577205957],
      [100_000_000, 50_000_001, 0.49999, 0.42070118647907379],
      [100_000_000, 50_000_001, 0.50001, 0.57922060498172012],
      [100_000_000, 50_000_001, 0.49995, 0.15863105685918508],
      [100_000_000, 50_000_001, 0.4999, 0.022744732041927007],
      [100_000_000, 50_000_001, 0.499, 2.7470041664336607e-89],
      [100_000_000, 10_000_001, 0.1, 0.49991577885294286],
      [100_000_000, 90_000_001, 0.9, 0.49995124038829503],
      [100_000_000, 99_000_001, 0.99, 0.49986501279953727],
      [100_000_000, 2, 1e-8, 0.26424111765711544],
      [100_000_000, 100_000_000, 0.99999999, 0.36787943748353941],
      [1_000_000, 250_001, 0.24999, 0.49025027124442988],
      [1_000_000, 750_001, 0.75001, 0.50882865701254343],
    ]

    for (const [dice, required, probability, expected] of cases) {
      const actual = binomialSurvivalProbability(dice, required, probability)
      const relativeError = Math.abs(actual - expected) / expected
      expect(relativeError, `${dice}, ${required}, ${probability}: ${actual}`)
        .toBeLessThan(2e-10)
    }
  })

  it('matches both binomial survival boundary identities at large dice counts', () => {
    for (const dice of [1, 1_000_000, 100_000_000]) {
      for (const probability of [1e-10, 0.37, 1 - 1e-8]) {
        const atLeastOne = -Math.expm1(dice * Math.log1p(-probability))
        const allSuccesses = Math.exp(dice * Math.log(probability))
        expect(binomialSurvivalProbability(dice, 1, probability))
          .toBeCloseTo(atLeastOne, 12)
        expect(binomialSurvivalProbability(dice, dice, probability))
          .toBeCloseTo(allSuccesses, 12)
      }
    }
  })

  it('uses a sublinear rank-based bounded work estimate', () => {
    const workingLength = 24
    const critical = 10
    const expectedOperations = workingLength * (
      critical - 1
      + getBinomialSurvivalOperationEstimate(100_000_000, 50_000_001)
    )
    expect(getDxOrderStatisticOperationEstimate(
      workingLength,
      100_000_000,
      50_000_000,
      critical,
    )).toBe(expectedOperations)
    expect(getBinomialSurvivalIterationBudget(100_000_000, 50_000_001))
      .toBeLessThan(Math.min(50_000_001, 100_000_000 - 50_000_000))
  })

  it('is monotone in the binomial probability and required successes', () => {
    const probabilities = [0.01, 0.1, 0.37, 0.5, 0.8, 0.99]
    const byProbability = probabilities.map((probability) => (
      binomialSurvivalProbability(100, 37, probability)
    ))
    for (let index = 1; index < byProbability.length; index += 1) {
      expect(byProbability[index]).toBeGreaterThanOrEqual(byProbability[index - 1])
    }

    const byRequired = Array.from({ length: 100 }, (_, index) => (
      binomialSurvivalProbability(100, index + 1, 0.37)
    ))
    for (let index = 1; index < byRequired.length; index += 1) {
      expect(byRequired[index]).toBeLessThanOrEqual(byRequired[index - 1])
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
