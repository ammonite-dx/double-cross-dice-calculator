import { describe, expect, it } from 'vitest'

import {
  calculateD10Distribution,
  calculateD10Distributions,
  createD10DistributionProvider,
  D10_MAX_GENERATION_LENGTH,
} from '../src/calculation/D10Calculator'

function enumerate(dice) {
  const result = new Float64Array(dice * 10 + 1)
  const outcomes = 10 ** dice
  const visit = (index, sum) => {
    if (index === dice) {
      result[sum] += 1 / outcomes
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      visit(index + 1, sum + face)
    }
  }
  visit(0, 0)
  return result
}

describe('runtime D10 calculator', () => {
  it('returns complete finite support, including zero dice', () => {
    expect(Array.from(calculateD10Distribution(0))).toEqual([1])
    const actual = calculateD10Distribution(2)
    const expected = enumerate(2)
    expect(actual).toHaveLength(21)
    for (let index = 0; index < actual.length; index += 1) {
      expect(actual[index]).toBeCloseTo(expected[index], 14)
    }
  })

  it('snapshots requested dice counts from one forward pass', () => {
    const result = calculateD10Distributions([0, 2, 4], 41)
    expect([...result.keys()]).toEqual([0, 2, 4])
    expect(result.get(2)).toHaveLength(41)
    expect(result.get(4)).toHaveLength(41)
    expect(result.get(4).slice(0, 4).every((value) => value === 0)).toBe(true)
  })

  it('supports dice counts beyond historical asset coverage', () => {
    const distribution = calculateD10Distribution(224)
    expect(distribution).toHaveLength(2241)
    let total = 0
    for (const probability of distribution) {
      expect(Number.isFinite(probability)).toBe(true)
      expect(probability).toBeGreaterThanOrEqual(0)
      total += probability
    }
    expect(total).toBeCloseTo(1, 12)
  })

  it('does not allocate when the complete support exceeds the safety policy', () => {
    expect(() => calculateD10Distribution(
      Math.floor((D10_MAX_GENERATION_LENGTH - 1) / 10) + 1
    )).toThrow(/absolute safety limit/)
  })

  it('memoizes only a bounded number of provider entries', () => {
    const provider = createD10DistributionProvider({ cacheSize: 1 })
    expect(provider(1, 11)).toHaveLength(11)
    expect(provider(2, 21)).toHaveLength(21)
    expect(provider(1, 11)).toHaveLength(11)
  })
})

