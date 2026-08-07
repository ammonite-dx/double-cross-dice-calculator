import { describe, expect, it } from 'vitest'

import {
  generateMixedDamageDistribution,
  MAX_DAMAGE_DICE,
  MAX_KAZANARI,
  RUNTIME_DAMAGE_DISTRIBUTION_SIZE,
  validateRuntimeDamageRollInputs,
} from '../src/calculation'
import drKazanari0 from '../public/data/schema-v2/revision-1/dr/kazanari-0.json'
import drKazanari3 from '../public/data/schema-v2/revision-1/dr/kazanari-3.json'
import drKazanari9 from '../public/data/schema-v2/revision-1/dr/kazanari-9.json'

const ASSET_TOLERANCE = 6e-7
const NUMERICAL_TOLERANCE = 1e-10

const assets = new Map([
  [0, drKazanari0],
  [3, drKazanari3],
  [9, drKazanari9],
])

function oneHotWeights(dice) {
  const weights = new Float64Array(dice + 1)
  weights[dice] = 1
  return weights
}

function expandSparseDistribution(sparseDistribution) {
  const distribution = new Float64Array(
    RUNTIME_DAMAGE_DISTRIBUTION_SIZE
  )
  distribution.set(
    sparseDistribution.values,
    sparseDistribution.offset
  )
  return distribution
}

function expectDistributionsClose(actual, expected, tolerance) {
  expect(actual).toHaveLength(expected.length)

  let maxDifference = 0
  for (let value = 0; value < actual.length; value += 1) {
    maxDifference = Math.max(
      maxDifference,
      Math.abs(actual[value] - expected[value])
    )
  }
  expect(maxDifference).toBeLessThanOrEqual(tolerance)
}

describe('production runtime damage roll calculator', () => {
  it.each([
    [0, 0],
    [0, 202],
    [3, 3],
    [3, 202],
    [9, 1],
    [9, 202],
  ])(
    'matches the current JSON distribution for kazanari=%i and dice=%i',
    (kazanari, dice) => {
      const actual = generateMixedDamageDistribution(
        oneHotWeights(dice),
        kazanari
      )
      const expected = expandSparseDistribution(
        assets.get(kazanari).distributions[dice]
      )

      expectDistributionsClose(actual, expected, ASSET_TOLERANCE)
    }
  )

  it.each([0, 3, 9])(
    'matches a JSON mixture for kazanari=%i',
    (kazanari) => {
      const weights = new Float64Array(MAX_DAMAGE_DICE + 1)
      weights[0] = 0.05
      weights[1] = 0.1
      weights[17] = 0.25
      weights[98] = 0.3
      weights[202] = 0.3
      const asset = assets.get(kazanari)
      const expected = new Float64Array(
        RUNTIME_DAMAGE_DISTRIBUTION_SIZE
      )

      for (let dice = 0; dice < weights.length; dice += 1) {
        const sparse = asset.distributions[dice]
        for (let index = 0; index < sparse.values.length; index += 1) {
          expected[sparse.offset + index] +=
            weights[dice] * sparse.values[index]
        }
      }

      const actual = generateMixedDamageDistribution(weights, kazanari)
      expectDistributionsClose(actual, expected, ASSET_TOLERANCE)
    }
  )

  it('preserves non-unit probability mass and output shape', () => {
    const weights = new Float64Array([0.2, 0.3])
    const distribution = generateMixedDamageDistribution(weights, 9)
    const total = distribution.reduce(
      (sum, probability) => sum + probability,
      0
    )

    expect(distribution).toBeInstanceOf(Float64Array)
    expect(distribution).toHaveLength(RUNTIME_DAMAGE_DISTRIBUTION_SIZE)
    expect(total).toBeCloseTo(0.5, 10)
    expect(Math.min(...distribution)).toBeGreaterThanOrEqual(
      -NUMERICAL_TOLERANCE
    )
  })

  it.each([0, 3, 9])(
    'handles zero damage dice for kazanari=%i',
    (kazanari) => {
      const distribution = generateMixedDamageDistribution([1], kazanari)

      expect(distribution[0]).toBe(1)
      expect(distribution.slice(1).every((probability) => probability === 0))
        .toBe(true)
    }
  )

  it('handles the maximum supported input', () => {
    const distribution = generateMixedDamageDistribution(
      oneHotWeights(MAX_DAMAGE_DICE),
      MAX_KAZANARI
    )
    const total = distribution.reduce(
      (sum, probability) => sum + probability,
      0
    )

    expect(total).toBeCloseTo(1, 10)
    expect(Math.max(...distribution)).toBeGreaterThan(0)
    expect(distribution[2047]).toBe(0)
  })

  it('rejects invalid inputs at the calculation boundary', () => {
    expect(() => generateMixedDamageDistribution({}, 0)).toThrow(TypeError)
    expect(() => generateMixedDamageDistribution([], 0)).toThrow(RangeError)
    expect(() => generateMixedDamageDistribution(
      new Array(MAX_DAMAGE_DICE + 2).fill(0),
      0
    )).toThrow(RangeError)
    expect(() => generateMixedDamageDistribution([1, -1], 0))
      .toThrow('finite non-negative')
    expect(() => generateMixedDamageDistribution([1, Number.NaN], 0))
      .toThrow('finite non-negative')
    expect(() => generateMixedDamageDistribution([1], -1)).toThrow(RangeError)
    expect(() => generateMixedDamageDistribution([1], 10)).toThrow(RangeError)
    expect(() => generateMixedDamageDistribution([1], 1.5)).toThrow(RangeError)
    expect(() => validateRuntimeDamageRollInputs([1], 0)).not.toThrow()
  })
})
