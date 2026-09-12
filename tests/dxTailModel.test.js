import { describe, expect, it } from 'vitest'

import {
  calculateYouseiTailProbability,
  findTailCutoff,
  maxTailBound,
  maxTailFirstMomentUpperBound,
  negativeBinomialPmf,
  oneDieCumulative,
  oneDieTail,
  scoreTailBound,
  youseiTailFirstMomentUpperBound,
} from '../src/calculation/DxTailModel'

describe('DxTailModel', () => {
  it('describes one-die cumulative and strict-tail probabilities at score boundaries', () => {
    expect(oneDieCumulative(0, 10)).toBe(0)
    expect(oneDieCumulative(9, 10)).toBeCloseTo(0.9, 15)
    expect(oneDieCumulative(10, 10)).toBeCloseTo(0.9, 15)
    expect(oneDieCumulative(10, 11)).toBeCloseTo(1, 15)

    for (const critical of [2, 5, 10, 11]) {
      for (const value of [0, 1, 9, 10, 37]) {
        expect(oneDieCumulative(value, critical) + oneDieTail(value, critical))
          .toBeCloseTo(1, 14)
      }
    }
    expect(oneDieTail(-1, 10)).toBe(1)
  })

  it('composes the maximum tail without allocating a distribution', () => {
    expect(maxTailBound(0, 0, 10)).toBe(0)
    expect(maxTailBound(9, 1, 10)).toBeCloseTo(0.1, 15)
    expect(maxTailBound(9, 2, 10)).toBeCloseTo(0.19, 15)
    expect(maxTailBound(100, 3, 11)).toBe(0)

    let previous = 1
    for (let value = 0; value <= 500; value += 1) {
      const current = maxTailBound(value, 10, 7)
      expect(current).toBeLessThanOrEqual(previous + 1e-14)
      expect(current).toBeGreaterThanOrEqual(0)
      expect(current).toBeLessThanOrEqual(1)
      previous = current
    }
  })

  it('keeps Yousei and negative-binomial tail certificates on exact boundaries', () => {
    expect(negativeBinomialPmf(0, 1, 0.1)).toBeCloseTo(0.9, 14)
    expect(negativeBinomialPmf(1, 1, 0.1)).toBeCloseTo(0.09, 14)
    expect(negativeBinomialPmf(0, 0, 0.1)).toBe(1)
    expect(negativeBinomialPmf(1, 0, 0.1)).toBe(0)

    const critical11 = { dice: 3, critical: 11, yousei: 1 }
    expect(calculateYouseiTailProbability(9, ...Object.values(critical11)))
      .toBe(1)
    expect(calculateYouseiTailProbability(10, ...Object.values(critical11)))
      .toBe(0)
    expect(scoreTailBound(9, { ...critical11, shihai: 0 })).toBe(1)
    expect(scoreTailBound(10, { ...critical11, shihai: 0 })).toBe(0)
  })

  it('returns a minimal cutoff and a finite first-moment upper bound', () => {
    const params = { dice: 4, critical: 8, shihai: 0, yousei: 0 }
    const cutoff = findTailCutoff(params, 1e-8)

    expect(cutoff.reachable).toBe(true)
    expect(cutoff.bound).toBeLessThanOrEqual(1e-8)
    expect(scoreTailBound(cutoff.cutoff - 1, params))
      .toBeGreaterThan(1e-8)

    const firstMoment = maxTailFirstMomentUpperBound(
      cutoff.cutoff,
      params.dice,
      params.critical,
    )
    expect(Number.isFinite(firstMoment)).toBe(true)
    expect(firstMoment).toBeGreaterThanOrEqual(0)
  })

  it.each([
    { critical: 10, yousei: 1 },
    { critical: 10, yousei: 3 },
    { critical: 8, yousei: 1 },
    { critical: 8, yousei: 3 },
    { critical: 5, yousei: 2 },
  ])('bounds the one-die Yousei residual against a local oracle: %o', ({ critical, yousei }) => {
    const cutoff = 80
    const dice = 1
    const criticalProbability = (11 - critical) / 10
    const successCount = yousei + 1
    let pmf = (1 - criticalProbability) ** successCount
    let oracle = 0

    for (let sum = 0; sum < 10000; sum += 1) {
      for (let remainder = 1; remainder < critical; remainder += 1) {
        const value = 10 * (yousei + sum) + remainder
        oracle +=
          pmf * Math.max(0, value - (cutoff + 1)) / (critical - 1)
      }
      const ratio = criticalProbability * (sum + successCount) / (sum + 1)
      pmf *= ratio
      if (sum > cutoff && pmf < 1e-16) {
        break
      }
    }

    const upperBound = youseiTailFirstMomentUpperBound(
      cutoff,
      dice,
      critical,
      yousei,
    )
    expect(upperBound).toBeGreaterThanOrEqual(oracle - 1e-12)
    expect(Number.isFinite(upperBound)).toBe(true)
  })

  it('keeps a maximum-safe-integer dice count finite without allocating by dice', () => {
    const upperBound = youseiTailFirstMomentUpperBound(
      12000,
      Number.MAX_SAFE_INTEGER,
      10,
      1000,
    )

    expect(Number.isFinite(upperBound)).toBe(true)
    expect(upperBound).toBeGreaterThanOrEqual(0)
    expect(upperBound).toBeLessThan(1)
  })
})
