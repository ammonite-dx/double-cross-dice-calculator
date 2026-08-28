import { describe, expect, it } from 'vitest'

import {
  calculateD10Distributions,
  calculateLivingdeadDistributions,
} from '../src/calculation/BacktrackCalculator'
import { BACKTRACK_MAX_GENERATION_LENGTH } from '../src/calculation/BacktrackLimits'

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

describe('backtrack distribution generators', () => {
  it('generates complete ordinary D10 support', () => {
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
})
