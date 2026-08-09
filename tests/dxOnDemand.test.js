import { describe, expect, it } from 'vitest'

import {
  calculateDxDistribution,
  DX_CRITICAL_MAX,
  DX_CRITICAL_MIN,
  DX_DICE_COUNT,
  DX_DISTRIBUTION_SIZE,
  DX_MAX_DISTRIBUTION_SIZE,
  DX_MIN_DISTRIBUTION_SIZE,
  DX_SHIHAI_MAX,
} from '../src/calculation'

function assertDistribution(distribution) {
  expect(distribution).toBeInstanceOf(Float64Array)
  expect(distribution).toHaveLength(DX_DISTRIBUTION_SIZE)

  let total = 0
  for (const probability of distribution) {
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(0)
    expect(probability).toBeLessThanOrEqual(1)
    total += probability
  }
  expect(total).toBeCloseTo(1, 12)
}

function expectPublishedValue(distribution, published, value) {
  const expectedIndex = value - published.offset
  const expected =
    expectedIndex >= 0 && expectedIndex < published.values.length
      ? published.values[expectedIndex]
      : 0
  expect(distribution[value]).toBeCloseTo(expected, 12)
}

describe('runtime dx distribution with shihai=0', () => {
  it('uses the closed cumulative-distribution power for one and zero dice', () => {
    const zeroDice = calculateDxDistribution({
      dice: 0,
      critical: DX_CRITICAL_MIN,
      shihai: 0,
    })
    const oneDie = calculateDxDistribution({
      dice: 1,
      critical: 10,
      shihai: 0,
    })

    assertDistribution(zeroDice)
    assertDistribution(oneDie)
    expect(zeroDice[0]).toBe(1)
    for (let value = 1; value <= 9; value += 1) {
      expect(oneDie[value]).toBeCloseTo(0.1, 12)
    }
    expect(oneDie[10]).toBe(0)
    expect(oneDie[11]).toBe(0.01)
  })

  it('preserves the critical=11 boundary and the maximum dice count', () => {
    const distribution = calculateDxDistribution({
      dice: DX_DICE_COUNT - 1,
      critical: DX_CRITICAL_MAX,
      shihai: 0,
    })

    assertDistribution(distribution)
    expect(distribution[10]).toBeGreaterThan(0)
    expect(distribution[11]).toBe(0)
  })
})

describe('runtime dx distribution with shihai>0', () => {
  it('returns automatic failure through and at the shihai boundary', () => {
    const belowBoundary = calculateDxDistribution({
      dice: DX_SHIHAI_MAX,
      critical: 7,
      shihai: DX_SHIHAI_MAX,
    })
    const atBoundary = calculateDxDistribution({
      dice: DX_SHIHAI_MAX + 1,
      critical: 7,
      shihai: DX_SHIHAI_MAX,
    })

    assertDistribution(belowBoundary)
    assertDistribution(atBoundary)
    expect(belowBoundary[0]).toBe(1)
    expect(belowBoundary.slice(1).every((probability) => probability === 0)).toBe(true)
    expect(atBoundary[0]).toBe(0)
    expect(atBoundary[1]).toBeGreaterThan(0)
  })

  it('handles the critical boundaries and maximum dice count', () => {
    for (const critical of [DX_CRITICAL_MIN, DX_CRITICAL_MAX]) {
      const distribution = calculateDxDistribution({
        dice: DX_DICE_COUNT - 1,
        critical,
        shihai: 1,
      })
      assertDistribution(distribution)
    }
  })

  it('matches the published distribution at a representative DP case', async () => {
    const asset = await import(
      '../public/data/schema-v2/revision-1/dx/shihai-3.json'
    )
    const published = asset.default.distributions[20][6 - 2]
    const distribution = calculateDxDistribution({
      dice: 20,
      critical: 6,
      shihai: 3,
    })

    assertDistribution(distribution)
    for (const value of [3, 4, 10, 11, 20, 31, 60, 2047]) {
      expectPublishedValue(distribution, published, value)
    }
  })
})

describe('runtime dx input validation', () => {
  it.each([
    null,
    {},
    { dice: -1, critical: 2, shihai: 0 },
    { dice: DX_DICE_COUNT, critical: 2, shihai: 0 },
    { dice: 1, critical: DX_CRITICAL_MIN - 1, shihai: 0 },
    { dice: 1, critical: DX_CRITICAL_MAX + 1, shihai: 0 },
    { dice: 1, critical: 10, shihai: -1 },
    { dice: 1, critical: 10, shihai: DX_SHIHAI_MAX + 1 },
  ])('rejects %o', (params) => {
    expect(() => calculateDxDistribution(params)).toThrow()
  })
})

describe('runtime dx dynamic working lengths', () => {
  it('reserves two slots for an explicit zero bucket and overflow bucket', () => {
    expect(DX_MIN_DISTRIBUTION_SIZE).toBe(2)
    const distribution = calculateDxDistribution(
      { dice: 0, critical: 11, shihai: 0 },
      { workingLength: DX_MIN_DISTRIBUTION_SIZE, rounding: 'unrounded' }
    )

    expect(distribution).toHaveLength(2)
    expect(distribution[0]).toBe(1)
    expect(distribution[1]).toBe(0)
  })

  it.each([
    { dice: 0, critical: 2, shihai: 0 },
    { dice: 99, critical: 2, shihai: 0 },
    { dice: 0, critical: 11, shihai: 19 },
    { dice: 99, critical: 11, shihai: 19 },
  ])('returns a valid unrounded distribution for %o', (params) => {
    const distribution = calculateDxDistribution(params, {
      workingLength: 4172,
      rounding: 'unrounded',
    })

    expect(distribution).toHaveLength(4172)
    let total = 0
    for (const probability of distribution) {
      expect(Number.isFinite(probability)).toBe(true)
      expect(Number.isNaN(probability)).toBe(false)
      expect(probability).toBeGreaterThanOrEqual(0)
      total += probability
    }
    expect(total).toBeCloseTo(1, 12)
  })

  it('accepts size as a compatibility alias and preserves the legacy path', () => {
    const params = { dice: 20, critical: 6, shihai: 3 }
    const defaultDistribution = calculateDxDistribution(params)
    const explicitLegacy = calculateDxDistribution(params, {
      size: DX_DISTRIBUTION_SIZE,
      rounding: 'legacy',
    })

    expect(Array.from(explicitLegacy)).toEqual(Array.from(defaultDistribution))
  })

  it('does not discard a small dynamic tail through compatibility rounding', () => {
    const distribution = calculateDxDistribution(
      { dice: 99, critical: 2, shihai: 0 },
      { workingLength: 4172, rounding: 'full-precision' }
    )

    expect(distribution[2001]).toBeGreaterThan(0)
  })

  it.each([
    { workingLength: 0 },
    { workingLength: DX_MIN_DISTRIBUTION_SIZE - 1 },
    { workingLength: 1.5 },
    { workingLength: Number.MAX_SAFE_INTEGER },
    { workingLength: DX_MAX_DISTRIBUTION_SIZE + 1 },
    { workingLength: null },
    { size: 32, workingLength: 64 },
    { workingLength: 32, rounding: 'unknown' },
  ])('rejects invalid dynamic options %o', (options) => {
    expect(() => calculateDxDistribution(
      { dice: 1, critical: 10, shihai: 0 },
      options
    )).toThrow()
  })
})
