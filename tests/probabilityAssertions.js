import { expect } from 'vitest'

export const DISTRIBUTION_LENGTH = 1024
const PROBABILITY_TOLERANCE = 2e-4

export function expectProbabilityDistribution (distribution) {
  expect(distribution).toHaveLength(DISTRIBUTION_LENGTH)

  for (const probability of distribution) {
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(-PROBABILITY_TOLERANCE)
    expect(probability).toBeLessThanOrEqual(1 + PROBABILITY_TOLERANCE)
  }

  const total = distribution.reduce((sum, probability) => sum + probability, 0)
  expect(Math.abs(total - 1)).toBeLessThan(PROBABILITY_TOLERANCE)
}

export function expectUpperTailProbability (distribution, upperTailProbability) {
  expect(upperTailProbability).toHaveLength(DISTRIBUTION_LENGTH)
  expect(Math.abs(upperTailProbability[0] - 1)).toBeLessThan(PROBABILITY_TOLERANCE)

  for (let index = 0; index < upperTailProbability.length; index++) {
    const probability = upperTailProbability[index]
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(-PROBABILITY_TOLERANCE)
    expect(probability).toBeLessThanOrEqual(1 + PROBABILITY_TOLERANCE)

    if (index > 0) {
      expect(probability).toBeLessThanOrEqual(
        upperTailProbability[index - 1] + PROBABILITY_TOLERANCE
      )

      const expectedProbability =
        upperTailProbability[index - 1] - distribution[index - 1]
      expect(Math.abs(probability - expectedProbability)).toBeLessThan(
        PROBABILITY_TOLERANCE
      )
    }
  }
}

export function expectProbabilityResult (result) {
  expectProbabilityDistribution(result.distribution)
  expectUpperTailProbability(result.distribution, result.upperTailProbability)
}
