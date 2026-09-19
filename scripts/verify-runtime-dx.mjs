import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { rolldown } from 'rolldown'
import {
  REFERENCE_WORKING_DISTRIBUTION_SIZE,
} from '../tooling/reference-data/ReferenceDataConstants.js'

async function loadRuntimeDxModule() {
  const entryPoint = fileURLToPath(
    new URL('../src/calculation/DxCalculator.js', import.meta.url)
  )
  const bundle = await rolldown({ input: entryPoint })
  const generated = await bundle.generate({ format: 'esm' })
  const source = generated.output?.[0]?.code
  if (typeof source !== 'string') {
    throw new Error('runtime DX verifier bundle was not generated')
  }
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  try {
    return await import(moduleUrl)
  } finally {
    await bundle.close?.()
  }
}

const {
  calculateDxDistribution,
  DX_CRITICAL_MAX,
  DX_CRITICAL_MIN,
} = await loadRuntimeDxModule()

// Keep the historical asset comparison matrix explicit. These values are
// fixture coverage, not runtime input ceilings.
const ASSET_DICE_COUNT = 100
const ASSET_SHIHAI_MAX = 19

const assetDirectory = new URL(
  '../tooling/reference-data/assets/schema-v2/revision-1/dx/',
  import.meta.url
)
const RUNTIME_OPTIONS = Object.freeze({
  workingLength: REFERENCE_WORKING_DISTRIBUTION_SIZE,
})
const COMPARISON_TOLERANCE = 1e-6 + 1e-12

async function loadAssets() {
  const assets = []
  for (let shihai = 0; shihai <= ASSET_SHIHAI_MAX; shihai += 1) {
    const url = new URL(`shihai-${shihai}.json`, assetDirectory)
    assets.push(JSON.parse(await readFile(url, 'utf8')))
  }
  return assets
}

function publishedProbability(distribution, value) {
  const index = value - distribution.offset
  return index >= 0 && index < distribution.values.length
    ? distribution.values[index]
    : 0
}

function expectedReferenceProbability(distribution, value, params) {
  // Revision-1 assets predate the raw fumble distinction and store the
  // positive-dice `dice <= shihai` shortcut at index 0. Keep those historical
  // files unchanged while comparing the current runtime rule (raw value 1).
  if (params.shihai > 0 && params.dice > 0 && params.dice <= params.shihai) {
    return value === 1 ? 1 : 0
  }
  return publishedProbability(distribution, value)
}

function benchmark(label, params, iterations = 10) {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    calculateDxDistribution(params, RUNTIME_OPTIONS)
  }

  const elapsed = []
  let checksum = 0
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now()
    const distribution = calculateDxDistribution(params, RUNTIME_OPTIONS)
    elapsed.push(performance.now() - start)
    checksum += distribution[1]
  }
  elapsed.sort((left, right) => left - right)

  return {
    label,
    params,
    iterations,
    minMs: elapsed[0],
    medianMs: elapsed[Math.floor(elapsed.length / 2)],
    maxMs: elapsed.at(-1),
    meanMs: elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length,
    checksum,
    float64WorkingBytes:
      params.shihai === 0
        ? REFERENCE_WORKING_DISTRIBUTION_SIZE * Float64Array.BYTES_PER_ELEMENT
        : 2 * REFERENCE_WORKING_DISTRIBUTION_SIZE *
          Float64Array.BYTES_PER_ELEMENT,
  }
}

const assets = await loadAssets()
const started = performance.now()
let caseCount = 0
let maxAbsoluteDifference = 0
let maxDifferenceContext = null
let maxTotalError = 0
let nonFiniteCount = 0
let negativeCount = 0
let tailCaseCount = 0
let tailMaximumDifference = 0

for (let shihai = 0; shihai <= ASSET_SHIHAI_MAX; shihai += 1) {
  const asset = assets[shihai]
  for (let dice = 0; dice < ASSET_DICE_COUNT; dice += 1) {
    for (
      let critical = DX_CRITICAL_MIN;
      critical <= DX_CRITICAL_MAX;
      critical += 1
    ) {
      const actual = calculateDxDistribution(
        { dice, critical, shihai },
        RUNTIME_OPTIONS
      )
      const published = asset.distributions[dice][critical - 2]
      let actualTotal = 0

      for (
        let value = 0;
        value < REFERENCE_WORKING_DISTRIBUTION_SIZE;
        value += 1
      ) {
        const probability = actual[value]
        actualTotal += probability
        if (!Number.isFinite(probability)) {
          nonFiniteCount += 1
        }
        if (probability < 0) {
          negativeCount += 1
        }

        const difference = Math.abs(
          probability - expectedReferenceProbability(
            published,
            value,
            { dice, shihai }
          )
        )
        if (difference > maxAbsoluteDifference) {
          maxAbsoluteDifference = difference
          maxDifferenceContext = { shihai, dice, critical, value }
        }
        if (value === REFERENCE_WORKING_DISTRIBUTION_SIZE - 1) {
          const publishedTail = publishedProbability(published, value)
          if (publishedTail > 0) {
            tailCaseCount += 1
          }
          tailMaximumDifference = Math.max(
            tailMaximumDifference,
            difference
          )
        }
      }

      maxTotalError = Math.max(maxTotalError, Math.abs(actualTotal - 1))
      caseCount += 1
    }
  }
}

const fullEnumerationMs = performance.now() - started
if (
  maxAbsoluteDifference > COMPARISON_TOLERANCE ||
  nonFiniteCount > 0 ||
  negativeCount > 0 ||
  maxTotalError > COMPARISON_TOLERANCE
) {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        caseCount,
        fullEnumerationMs,
        maxAbsoluteDifference,
        maxDifferenceContext,
        maxTotalError,
        nonFiniteCount,
        negativeCount,
        tailCaseCount,
        tailMaximumDifference,
      },
      null,
      2
    )
  )
  process.exitCode = 1
} else {
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        caseCount,
        fullEnumerationMs,
        comparisonTolerance: COMPARISON_TOLERANCE,
        maxAbsoluteDifference,
        maxDifferenceContext,
        maxTotalError,
        nonFiniteCount,
        negativeCount,
        tailCaseCount,
        tailMaximumDifference,
        benchmarks: [
          benchmark('shihai=0 representative', {
            dice: 20,
            critical: 8,
            shihai: 0,
          }),
          benchmark('shihai>0 representative', {
            dice: 20,
            critical: 8,
            shihai: 3,
          }),
          benchmark('shihai=0 maximum', {
            dice: ASSET_DICE_COUNT - 1,
            critical: DX_CRITICAL_MIN,
            shihai: 0,
          }),
          benchmark('shihai>0 maximum', {
            dice: ASSET_DICE_COUNT - 1,
            critical: DX_CRITICAL_MIN,
            shihai: ASSET_SHIHAI_MAX,
          }),
        ],
      },
      null,
      2
    )
  )
}
