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
})
