import { describe, expect, it } from 'vitest'

import {
  generateMixedDamageDistribution,
  RUNTIME_DAMAGE_DISTRIBUTION_SIZE,
} from '../../src/calculation/RuntimeDamageRollCalculator'

import drKazanari0 from '../../tooling/reference-data/assets/schema-v2/revision-1/dr/kazanari-0.json'
import drKazanari3 from '../../tooling/reference-data/assets/schema-v2/revision-1/dr/kazanari-3.json'
import drKazanari9 from '../../tooling/reference-data/assets/schema-v2/revision-1/dr/kazanari-9.json'

const LEGACY_ASSET_MAX_DAMAGE_DICE = 202
const ASSET_TOLERANCE = 6e-7

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

describe('published runtime damage-roll reference', () => {
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
      const weights = new Float64Array(LEGACY_ASSET_MAX_DAMAGE_DICE + 1)
      weights[0] = 0.05
      weights[1] = 0.1
      weights[17] = 0.25
      weights[98] = 0.3
      weights[LEGACY_ASSET_MAX_DAMAGE_DICE] = 0.3
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
})
