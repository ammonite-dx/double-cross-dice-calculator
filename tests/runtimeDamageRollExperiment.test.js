import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  generateMixedDamageDistributionReference,
  runtimeDamageRollReferenceConstants,
} from '../experiments/runtime-dr/reference'
import { generateMixedDamageDistributionOptimized } from '../experiments/runtime-dr/optimized'

const assetDirectory = new URL(
  '../public/data/schema-v2/revision-1/dr/',
  import.meta.url
)
const COMPARISON_TOLERANCE = 6e-7
const NUMERICAL_TOLERANCE = 1e-10

async function readAsset(kazanari) {
  return JSON.parse(
    await readFile(
      new URL(`kazanari-${kazanari}.json`, assetDirectory),
      'utf8'
    )
  )
}

function expandDistribution(sparseDistribution) {
  const distribution = new Float64Array(
    runtimeDamageRollReferenceConstants.distributionSize
  )
  distribution.set(
    sparseDistribution.values,
    sparseDistribution.offset
  )
  return distribution
}

function oneHotWeights(dice) {
  const weights = new Float64Array(dice + 1)
  weights[dice] = 1
  return weights
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

describe('runtime dr reference experiment', () => {
  it.each([
    [0, 0],
    [0, 1],
    [0, 10],
    [0, 202],
    [1, 1],
    [1, 2],
    [1, 10],
    [3, 2],
    [3, 10],
    [3, 202],
    [9, 1],
    [9, 9],
    [9, 10],
    [9, 202],
  ])(
    'matches the current asset for kazanari=%i and dice=%i',
    async (kazanari, dice) => {
      const asset = await readAsset(kazanari)
      const actual = generateMixedDamageDistributionReference(
        oneHotWeights(dice),
        kazanari
      )
      const expected = expandDistribution(asset.distributions[dice])

      expectDistributionsClose(actual, expected, COMPARISON_TOLERANCE)
    }
  )

  it('matches a direct mixture of current assets', async () => {
    const kazanari = 5
    const weights = new Float64Array(203)
    weights[0] = 0.05
    weights[1] = 0.1
    weights[17] = 0.25
    weights[98] = 0.3
    weights[202] = 0.3
    const asset = await readAsset(kazanari)
    const expected = new Float64Array(
      runtimeDamageRollReferenceConstants.distributionSize
    )

    for (let dice = 0; dice < weights.length; dice += 1) {
      const sparse = asset.distributions[dice]
      for (let index = 0; index < sparse.values.length; index += 1) {
        expected[sparse.offset + index] +=
          weights[dice] * sparse.values[index]
      }
    }

    const actual = generateMixedDamageDistributionReference(
      weights,
      kazanari
    )
    expectDistributionsClose(actual, expected, COMPARISON_TOLERANCE)
  })

  it('preserves probability mass and numerical non-negativity', () => {
    const weights = new Float64Array(203)
    weights[3] = 0.2
    weights[67] = 0.35
    weights[202] = 0.15
    const expectedTotal = weights.reduce((sum, weight) => sum + weight, 0)
    const distribution = generateMixedDamageDistributionReference(weights, 9)
    const actualTotal = distribution.reduce(
      (sum, probability) => sum + probability,
      0
    )

    expect(Math.abs(actualTotal - expectedTotal)).toBeLessThan(
      NUMERICAL_TOLERANCE
    )
    expect(Math.min(...distribution)).toBeGreaterThanOrEqual(
      -NUMERICAL_TOLERANCE
    )
  })
})

describe('runtime dr optimized experiment', () => {
  it.each([0, 1, 3, 5, 9])(
    'matches the reference implementation for kazanari=%i',
    (kazanari) => {
      const weights = new Float64Array(203)
      weights[0] = 0.05
      weights[1] = 0.1
      weights[17] = 0.25
      weights[98] = 0.3
      weights[202] = 0.3

      const actual = generateMixedDamageDistributionOptimized(
        weights,
        kazanari
      )
      const expected = generateMixedDamageDistributionReference(
        weights,
        kazanari
      )

      expectDistributionsClose(actual, expected, NUMERICAL_TOLERANCE)
    }
  )
})
