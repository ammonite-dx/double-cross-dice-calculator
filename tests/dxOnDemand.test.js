import { describe, expect, it } from 'vitest'

import {
  calculateDxDistribution,
  DX_CRITICAL_MAX,
  DX_CRITICAL_MIN,
  DX_MAX_DISTRIBUTION_SIZE,
  DX_MIN_DISTRIBUTION_SIZE,
} from '../src/calculation/DxCalculator'
const TEST_WORKING_LENGTH = 4096
const COMPARISON_DICE = 99
const COMPARISON_SHIHAI = 19

function assertDistribution(
  distribution,
  expectedLength = TEST_WORKING_LENGTH
) {
  expect(distribution).toBeInstanceOf(Float64Array)
  expect(distribution).toHaveLength(expectedLength)

  let total = 0
  for (const probability of distribution) {
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(0)
    expect(probability).toBeLessThanOrEqual(1)
    total += probability
  }
  expect(total).toBeCloseTo(1, 12)
}

describe('runtime dx distribution with shihai=0', () => {
  it('uses the closed cumulative-distribution power for one and zero dice', () => {
    const zeroDice = calculateDxDistribution({
      dice: 0,
      critical: DX_CRITICAL_MIN,
      shihai: 0,
    }, { workingLength: TEST_WORKING_LENGTH })
    const oneDie = calculateDxDistribution({
      dice: 1,
      critical: 10,
      shihai: 0,
    }, { workingLength: TEST_WORKING_LENGTH })

    assertDistribution(zeroDice)
    assertDistribution(oneDie)
    expect(zeroDice[0]).toBe(1)
    for (let value = 1; value <= 9; value += 1) {
      expect(oneDie[value]).toBeCloseTo(0.1, 12)
    }
    expect(oneDie[10]).toBe(0)
    expect(oneDie[11]).toBeCloseTo(0.01, 12)
  })

  it('preserves the critical=11 boundary and the maximum dice count', () => {
    const distribution = calculateDxDistribution({
      dice: COMPARISON_DICE,
      critical: DX_CRITICAL_MAX,
      shihai: 0,
    }, { workingLength: TEST_WORKING_LENGTH })

    assertDistribution(distribution)
    expect(distribution[10]).toBeGreaterThan(0)
    expect(distribution[11]).toBe(0)
  })
})

describe('runtime dx distribution with shihai>0', () => {
  it('accepts dice and target counts beyond the historical asset range', () => {
    const distribution = calculateDxDistribution(
      { dice: 100, critical: 11, shihai: 20 },
      { workingLength: 64 }
    )

    expect(distribution).toHaveLength(64)
    expect(distribution.reduce((sum, probability) => sum + probability, 0))
      .toBeCloseTo(1, 12)
    expect(distribution.some((probability) => probability > 0)).toBe(true)
  })

  it('distinguishes automatic failure from a shihai-induced fumble', () => {
    const belowBoundary = calculateDxDistribution({
      dice: COMPARISON_SHIHAI,
      critical: 7,
      shihai: COMPARISON_SHIHAI,
    }, { workingLength: TEST_WORKING_LENGTH })
    const atBoundary = calculateDxDistribution({
      dice: COMPARISON_SHIHAI + 1,
      critical: 7,
      shihai: COMPARISON_SHIHAI,
    }, { workingLength: TEST_WORKING_LENGTH })

    assertDistribution(belowBoundary)
    assertDistribution(atBoundary)
    expect(belowBoundary[0]).toBe(0)
    expect(belowBoundary[1]).toBe(1)
    expect(belowBoundary.slice(2).every((probability) => probability === 0)).toBe(true)
    expect(atBoundary[0]).toBe(0)
    expect(atBoundary[1]).toBeGreaterThan(0)
  })

  it('handles the critical boundaries and maximum dice count', () => {
    for (const critical of [DX_CRITICAL_MIN, DX_CRITICAL_MAX]) {
      const distribution = calculateDxDistribution({
        dice: COMPARISON_DICE,
        critical,
        shihai: 1,
      }, { workingLength: TEST_WORKING_LENGTH })
      assertDistribution(distribution)
    }
  })

})

describe('runtime dx input validation', () => {
  it.each([
    null,
    {},
    { dice: -1, critical: 2, shihai: 0 },
    { dice: Number.MAX_SAFE_INTEGER + 1, critical: 2, shihai: 0 },
    { dice: 1, critical: DX_CRITICAL_MIN - 1, shihai: 0 },
    { dice: 1, critical: DX_CRITICAL_MAX + 1, shihai: 0 },
    { dice: 1, critical: 10, shihai: -1 },
    { dice: 1, critical: 10, shihai: -1 },
  ])('rejects %o', (params) => {
    expect(() => calculateDxDistribution(params)).toThrow()
  })
})

describe('runtime dx dynamic working lengths', () => {
  it('reserves two slots for an explicit zero bucket and overflow bucket', () => {
    expect(DX_MIN_DISTRIBUTION_SIZE).toBe(2)
    const distribution = calculateDxDistribution(
      { dice: 0, critical: 11, shihai: 0 },
      { workingLength: DX_MIN_DISTRIBUTION_SIZE }
    )

    expect(distribution).toHaveLength(2)
    expect(distribution[0]).toBe(1)
    expect(distribution[1]).toBe(0)
  })

  it.each([
    { dice: 0, critical: 2, shihai: 0 },
    { dice: COMPARISON_DICE, critical: 2, shihai: 0 },
    { dice: 0, critical: 11, shihai: 19 },
    { dice: COMPARISON_DICE, critical: 11, shihai: COMPARISON_SHIHAI },
  ])('returns a valid full-precision distribution for %o', (params) => {
    const distribution = calculateDxDistribution(params, {
      workingLength: 4172,
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

  it('requires an explicit working length for direct DX calls', () => {
    const params = { dice: 20, critical: 6, shihai: 3 }
    expect(() => calculateDxDistribution(params)).toThrow('workingLength')
    const explicit = calculateDxDistribution(params, {
      workingLength: TEST_WORKING_LENGTH,
    })
    assertDistribution(explicit)
  })

  it('does not discard a small dynamic tail at an extended working length', () => {
    const distribution = calculateDxDistribution(
      { dice: 99, critical: 2, shihai: 0 },
      { workingLength: 4172 }
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
    { workingLength: 32, fftLength: -1 },
    { workingLength: 32, fftLength: 1.5 },
  ])('rejects invalid dynamic options %o', (options) => {
    expect(() => calculateDxDistribution(
      { dice: 1, critical: 10, shihai: 0 },
      options
    )).toThrow()
  })
})
