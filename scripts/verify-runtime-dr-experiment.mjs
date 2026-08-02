import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

import {
  generateMixedDamageDistributionReference,
  runtimeDamageRollReferenceConstants,
} from '../experiments/runtime-dr/reference.js'
import { generateMixedDamageDistributionOptimized } from '../experiments/runtime-dr/optimized.js'

const assetDirectory = new URL(
  '../public/data/schema-v2/revision-1/dr/',
  import.meta.url
)
const COMPARISON_TOLERANCE = 6e-7
const optimized = process.argv.includes('--optimized')
const implementationName = optimized ? 'optimized' : 'reference'
const generateDistribution = optimized
  ? generateMixedDamageDistributionOptimized
  : generateMixedDamageDistributionReference

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

function compareDistributions(actual, expected) {
  let maxDifference = 0
  let maxDifferenceIndex = 0

  for (let value = 0; value < actual.length; value += 1) {
    const difference = Math.abs(actual[value] - expected[value])
    if (difference > maxDifference) {
      maxDifference = difference
      maxDifferenceIndex = value
    }
  }

  return { maxDifference, maxDifferenceIndex }
}

const started = performance.now()
let checked = 0
let largestDifference = 0
let largestDifferenceCase = null

for (
  let kazanari = 0;
  kazanari <= runtimeDamageRollReferenceConstants.maxKazanari;
  kazanari += 1
) {
  const asset = JSON.parse(
    await readFile(
      new URL(`kazanari-${kazanari}.json`, assetDirectory),
      'utf8'
    )
  )

  for (
    let dice = 0;
    dice <= runtimeDamageRollReferenceConstants.maxDamageDice;
    dice += 1
  ) {
    const weights = new Float64Array(dice + 1)
    weights[dice] = 1
    const actual = generateDistribution(
      weights,
      kazanari
    )
    const expected = expandDistribution(asset.distributions[dice])
    const comparison = compareDistributions(actual, expected)

    if (comparison.maxDifference > largestDifference) {
      largestDifference = comparison.maxDifference
      largestDifferenceCase = {
        kazanari,
        dice,
        value: comparison.maxDifferenceIndex,
      }
    }
    if (comparison.maxDifference > COMPARISON_TOLERANCE) {
      throw new Error(
        `distribution mismatch: kazanari=${kazanari}, dice=${dice}, ` +
        `value=${comparison.maxDifferenceIndex}, ` +
        `difference=${comparison.maxDifference}`
      )
    }

    checked += 1
  }

  console.log(`verified kazanari=${kazanari}`)
}

const elapsed = performance.now() - started
console.log(
  `verified ${checked} ${implementationName} distributions in ` +
  `${(elapsed / 1000).toFixed(2)} s`
)
console.log(
  `largest difference: ${largestDifference} at ` +
  `kazanari=${largestDifferenceCase.kazanari}, ` +
  `dice=${largestDifferenceCase.dice}, ` +
  `value=${largestDifferenceCase.value}`
)
