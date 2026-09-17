import { describe, expect, it } from 'vitest'

import { calculateDxDistribution } from '../../src/calculation/DxCalculator'

const PUBLISHED_QUANTIZATION_TOLERANCE = 1e-6 + 1e-12

function assertDistribution(distribution) {
  expect(distribution).toBeInstanceOf(Float64Array)
  let total = 0
  for (const probability of distribution) {
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(0)
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
  expect(Math.abs(distribution[value] - expected))
    .toBeLessThanOrEqual(PUBLISHED_QUANTIZATION_TOLERANCE)
}

describe('published DX reference', () => {
  it('matches the quantized published distribution within its reference tolerance', async () => {
    const asset = await import(
      '../../public/data/schema-v2/revision-1/dx/shihai-3.json'
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
