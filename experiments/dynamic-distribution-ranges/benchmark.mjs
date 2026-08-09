import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { performance } from 'node:perf_hooks'

import {
  calculateDxDistribution,
  DX_DISTRIBUTION_SIZE,
} from '../../src/calculation/DxCalculator.js'
import {
  generateMixedDamageDistributionOptimized as generateMixedDamageDistribution,
} from '../runtime-dr/optimized.js'
import { transform } from '../../src/calculation/RuntimeDamageRollFFT.js'
import {
  findTailCutoff,
  nextPowerOfTwo,
  planCalculationRanges,
  scoreTailBound,
} from './planner.mjs'

const root = new URL('../../', import.meta.url)
const output = new URL('./results.json', import.meta.url)
const requestedNodeVersion = (
  await readFile(new URL('.node-version', root), 'utf8')
).trim()

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function checksumDistribution(distribution) {
  let checksum = 0
  for (let index = 0; index < distribution.length; index += 1) {
    checksum += (index + 1) * distribution[index]
  }
  return checksum
}

function measure(label, iterations, operation) {
  for (let iteration = 0; iteration < 2; iteration += 1) {
    operation()
  }

  const samples = []
  let checksum = 0
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now()
    const result = operation()
    samples.push(performance.now() - started)
    if (typeof result === 'number') {
      checksum += result
    } else if (result instanceof Float64Array) {
      checksum += checksumDistribution(result)
    }
  }

  return {
    label,
    iterations,
    minMs: Math.min(...samples),
    medianMs: median(samples),
    maxMs: Math.max(...samples),
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    checksum,
  }
}

function createBinomialTable(maxDice) {
  const table = []
  for (let n = 0; n <= maxDice; n += 1) {
    const row = new Float64Array(n + 1)
    row[0] = 1
    row[n] = 1
    for (let k = 1; k < n; k += 1) {
      row[k] = table[n - 1][k - 1] + table[n - 1][k]
    }
    table.push(row)
  }
  return table
}

function binomialTail(table, dice, required, probability) {
  if (required <= 0) {
    return 1
  }
  if (required > dice) {
    return 0
  }
  const coefficients = table[dice]
  const complement = 1 - probability
  let result = 0
  for (let successes = required; successes <= dice; successes += 1) {
    result +=
      coefficients[successes] *
      probability ** successes *
      complement ** (dice - successes)
  }
  return result
}

function binomialProbabilities(table, dice, probability) {
  const result = new Float64Array(dice + 1)
  const coefficients = table[dice]
  const complement = 1 - probability
  for (let successes = 0; successes <= dice; successes += 1) {
    result[successes] =
      coefficients[successes] *
      probability ** successes *
      complement ** (dice - successes)
  }
  return result
}

function geometricSum(probability, terms) {
  if (probability === 1) {
    return terms
  }
  return (1 - probability ** terms) / (1 - probability)
}

function oneDieCumulative(value, critical) {
  if (value <= 0) {
    return 0
  }
  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical && face <= value; face += 1) {
    const terms = Math.floor((value - face) / 10) + 1
    result += 0.1 * geometricSum(criticalProbability, terms)
  }
  return Math.min(1, result)
}

function calculateDxWithSupport({ dice, critical, shihai, size, table }) {
  const overflowIndex = size - 1
  const coefficientsTable = table ?? createBinomialTable(dice)
  if (shihai === 0) {
    const result = new Float64Array(size)
    if (dice === 0) {
      result[0] = 1
      return result
    }
    let previousCumulative = 0
    let total = 0
    for (let value = 0; value < overflowIndex; value += 1) {
      const cumulative = oneDieCumulative(value, critical) ** dice
      result[value] = cumulative - previousCumulative
      previousCumulative = cumulative
      total += result[value]
    }
    result[overflowIndex] = Math.max(0, 1 - total)
    return result
  }

  const resultByDice = Array.from(
    { length: dice + 1 },
    () => new Float64Array(size)
  )
  for (let currentDice = 0; currentDice <= Math.min(dice, shihai); currentDice += 1) {
    resultByDice[currentDice][0] = 1
  }

  const criticalProbability = (11 - critical) / 10
  for (let currentDice = shihai + 1; currentDice <= dice; currentDice += 1) {
    const stage = new Float64Array(size)
    const rankFromLargest = shihai + 1
    for (let face = 1; face < critical; face += 1) {
      const atLeastFace = binomialTail(
        coefficientsTable,
        currentDice,
        rankFromLargest,
        (11 - face) / 10,
      )
      const aboveFace = binomialTail(
        coefficientsTable,
        currentDice,
        rankFromLargest,
        (10 - face) / 10,
      )
      stage[face] = atLeastFace - aboveFace
    }

    const criticalCounts = binomialProbabilities(
      coefficientsTable,
      currentDice,
      criticalProbability,
    )
    for (
      let criticalDice = shihai + 1;
      criticalDice < currentDice;
      criticalDice += 1
    ) {
      const source = resultByDice[criticalDice]
      const weight = criticalCounts[criticalDice]
      for (let value = 10; value < size; value += 1) {
        stage[value] += weight * source[value - 10]
      }
    }

    const result = new Float64Array(size)
    const allCriticalProbability = criticalProbability ** currentDice
    for (let value = 0; value < size; value += 1) {
      result[value] =
        stage[value] +
        (value >= 10 ? allCriticalProbability * result[value - 10] : 0)
    }
    let total = 0
    for (let value = 0; value < overflowIndex; value += 1) {
      total += result[value]
    }
    result[overflowIndex] = Math.max(0, 1 - total)
    resultByDice[currentDice] = result
  }

  return resultByDice[dice]
}

function createDxBenchmarkOperation(params, size) {
  const table = createBinomialTable(params.dice)
  return () => calculateDxWithSupport({ ...params, size, table })
}

function makeWeights(maxDamageDice) {
  const weights = new Float64Array(maxDamageDice + 1)
  for (let dice = 0; dice <= maxDamageDice; dice += 1) {
    const distance = dice - Math.min(24, maxDamageDice / 3)
    weights[dice] = Math.exp(-(distance * distance) / 72)
  }
  const total = weights.reduce((sum, value) => sum + value, 0)
  for (let dice = 0; dice <= maxDamageDice; dice += 1) {
    weights[dice] /= total
  }
  return weights
}

function generateMixedD10NoReroll(weights, fftSize, outputSize) {
  const real = new Float64Array(fftSize)
  const imaginary = new Float64Array(fftSize)
  const halfSize = fftSize / 2

  for (let frequency = 0; frequency <= halfSize; frequency += 1) {
    const angle = -2 * Math.PI * frequency / fftSize
    const rootReal = Math.cos(angle)
    const rootImaginary = Math.sin(angle)
    let powerReal = 1
    let powerImaginary = 0
    let d10Real = 0
    let d10Imaginary = 0
    for (let face = 1; face <= 10; face += 1) {
      const nextPowerReal =
        powerReal * rootReal - powerImaginary * rootImaginary
      const nextPowerImaginary =
        powerReal * rootImaginary + powerImaginary * rootReal
      powerReal = nextPowerReal
      powerImaginary = nextPowerImaginary
      d10Real += 0.1 * powerReal
      d10Imaginary += 0.1 * powerImaginary
    }

    let valueReal = 0
    let valueImaginary = 0
    for (let degree = weights.length - 1; degree >= 0; degree -= 1) {
      const nextReal =
        valueReal * d10Real - valueImaginary * d10Imaginary + weights[degree]
      valueImaginary =
        valueReal * d10Imaginary + valueImaginary * d10Real
      valueReal = nextReal
    }
    real[frequency] = valueReal
    imaginary[frequency] = valueImaginary
    if (frequency > 0 && frequency < halfSize) {
      real[fftSize - frequency] = valueReal
      imaginary[fftSize - frequency] = -valueImaginary
    }
  }

  transform(real, imaginary, true)
  const distribution = new Float64Array(outputSize)
  for (let value = 0; value < outputSize - 1; value += 1) {
    distribution[value] = real[value]
  }
  for (let value = outputSize - 1; value < fftSize; value += 1) {
    distribution[outputSize - 1] += real[value]
  }
  return distribution
}

function planSummary(plan) {
  return {
    accepted: plan.accepted,
    operation: plan.operation,
    propagation: plan.propagation,
    display: plan.display,
    score: plan.scores.map((score) => ({
      params: score.params,
      tailModel: score.tail.model,
      tailCutoff: score.tail.cutoff,
      tailBound: score.tail.bound,
      workingLength: score.workingLength,
      outputMax: score.outputMax,
      fftLength: score.fftLength,
    })),
    damage: plan.damage && {
      scoreValueMode: plan.damage.scoreValueMode,
      scoreValueUpperBound: plan.damage.scoreValueUpperBound,
      maxDamageDice: plan.damage.maxDamageDice,
      rawSupportMax: plan.damage.rawSupportMax,
      rawMax: plan.damage.rawMax,
      workingLength: plan.damage.workingLength,
      fftLength: plan.damage.fftLength,
      defenceFftLength: plan.damage.defenceFftLength,
    },
    estimates: plan.estimates,
    warnings: plan.warnings,
    rejectionReasons: plan.rejectionReasons ?? [],
  }
}

function legacyYouseiUnionTailBound(value, params) {
  const { dice, critical, yousei } = params
  if (yousei === 0) {
    return scoreTailBound(value, params)
  }
  const adjusted = Math.floor((value - 9 * yousei) / (yousei + 1))
  if (adjusted <= 0) {
    return 1
  }
  const maxTail = (tailValue, tailDice) => scoreTailBound(
    tailValue,
    { dice: tailDice, critical, shihai: 0, yousei: 0 },
  )
  return Math.min(
    1,
    maxTail(adjusted, dice) + yousei * maxTail(adjusted, 1),
  )
}

function findCutoffWithEvaluator(params, epsilon, evaluator) {
  let high = 1
  while (high < (1 << 20) && evaluator(high, params) > epsilon) {
    high *= 2
  }
  let low = -1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (evaluator(middle, params) <= epsilon) {
      high = middle
    } else {
      low = middle
    }
  }
  return { cutoff: high, bound: evaluator(high, params) }
}

const dxCases = [
  {
    label: 'dx current shihai=0',
    params: { dice: 99, critical: 8, shihai: 0 },
    size: 2048,
    iterations: 30,
    operation: () => calculateDxDistribution({ dice: 99, critical: 8, shihai: 0 }),
  },
  {
    label: 'dx current shihai=19',
    params: { dice: 99, critical: 2, shihai: 19 },
    size: 2048,
    iterations: 5,
    operation: () => calculateDxDistribution({ dice: 99, critical: 2, shihai: 19 }),
  },
  {
    label: 'dx expanded shihai=0',
    params: { dice: 200, critical: 2, shihai: 0 },
    size: 4096,
    iterations: 5,
    operation: createDxBenchmarkOperation({ dice: 200, critical: 2, shihai: 0 }, 4096),
  },
  {
    label: 'dx expanded shihai=19',
    params: { dice: 200, critical: 2, shihai: 19 },
    size: 4096,
    iterations: 2,
    operation: createDxBenchmarkOperation({ dice: 200, critical: 2, shihai: 19 }, 4096),
  },
  {
    label: 'dx large shihai=19',
    params: { dice: 300, critical: 5, shihai: 19 },
    size: 4096,
    iterations: 1,
    operation: createDxBenchmarkOperation({ dice: 300, critical: 5, shihai: 19 }, 4096),
  },
]

const fftCases = [2048, 4096, 8192, 16384, 32768].map((size) => ({
  label: `fft transform ${size}`,
  size,
  iterations: size <= 8192 ? 10 : 3,
  operation: () => {
    const real = new Float64Array(size)
    const imaginary = new Float64Array(size)
    real[0] = 1
    real[1] = 0.5
    transform(real, imaginary)
    transform(real, imaginary, true)
    return real[0]
  },
}))

const damageCases = [
  { maxDamageDice: 202, kazanari: 0, fftSize: 4096, iterations: 20, current: true },
  { maxDamageDice: 202, kazanari: 9, fftSize: 4096, iterations: 10, current: true },
  { maxDamageDice: 304, kazanari: 0, iterations: 10 },
  { maxDamageDice: 400, kazanari: 0, iterations: 10 },
  { maxDamageDice: 512, kazanari: 0, iterations: 5 },
  { maxDamageDice: 800, kazanari: 0, iterations: 3 },
].map((item) => {
  const fftSize = item.fftSize ?? nextPowerOfTwo(10 * item.maxDamageDice + 1)
  const weights = makeWeights(item.maxDamageDice)
  return {
    label: `${item.current ? 'dr current optimized' : 'dr candidate polynomial'} kazanari=${item.kazanari} maxDice=${item.maxDamageDice}`,
    maxDamageDice: item.maxDamageDice,
    kazanari: item.kazanari,
    fftSize,
    iterations: item.iterations,
    operation: item.current
      ? () => generateMixedDamageDistribution(weights, item.kazanari)
      : () => generateMixedD10NoReroll(weights, fftSize, Math.min(fftSize, 2048)),
  }
})

const plannerCases = [
  {
    label: 'planner current maximum',
    params: {
      operation: 'attack',
      score: {
        action: { dice: 99, critical: 2, shihai: 0, yousei: 0, skill: 999 },
        reaction: { dice: 99, critical: 2, shihai: 19, yousei: 0, skill: -999 },
      },
      attack: { dice: 99, value: 999, kazanari: 9 },
      defence: { dice: 99, value: -999 },
      comboCount: 1,
    },
  },
  {
    label: 'planner extended moderate',
    params: {
      operation: 'attack',
      score: {
        action: { dice: 200, critical: 2, shihai: 0, yousei: 0, skill: 500 },
        reaction: { dice: 120, critical: 5, shihai: 19, yousei: 0, skill: 0 },
      },
      attack: { dice: 150, value: 500, kazanari: 3 },
      defence: { dice: 120, value: -500 },
      comboCount: 3,
    },
  },
  {
    label: 'planner extended shihai',
    params: {
      operation: 'attack',
      score: {
        action: { dice: 300, critical: 5, shihai: 19, yousei: 0, skill: 0 },
        reaction: { dice: 300, critical: 5, shihai: 19, yousei: 0, skill: 0 },
      },
      attack: { dice: 250, value: 750, kazanari: 9 },
      defence: { dice: 200, value: -750 },
      comboCount: 5,
    },
  },
  {
    label: 'planner exact-yousei stress',
    params: {
      operation: 'score',
      score: { dice: 99, critical: 2, shihai: 0, yousei: 9, skill: 0 },
    },
  },
  {
    label: 'planner incompatible shihai-yousei',
    params: {
      operation: 'score',
      score: { dice: 10, critical: 2, shihai: 1, yousei: 1, skill: 0 },
    },
  },
  {
    label: 'planner full-tail propagation',
    policy: { scorePropagation: 'full-tail' },
    params: {
      operation: 'attack',
      score: {
        action: { dice: 200, critical: 2, shihai: 0, yousei: 0, skill: 500 },
        reaction: { dice: 99, critical: 8, shihai: 0, yousei: 0, skill: 0 },
      },
      attack: { dice: 150, value: 500, kazanari: 0 },
      defence: { dice: 99, value: -500 },
      comboCount: 1,
    },
  },
]

const plans = plannerCases.map(({ label, params, policy }) => ({
  label,
  plan: planSummary(planCalculationRanges(params, policy)),
  benchmark: (() => {
    const measurement = measure(
      `planner ${label}`,
      10,
      () => planCalculationRanges(params, policy),
    )
    return {
      iterations: measurement.iterations,
      minMs: measurement.minMs,
      medianMs: measurement.medianMs,
      maxMs: measurement.maxMs,
      meanMs: measurement.meanMs,
    }
  })(),
}))

const result = {
  metadata: {
    generatedAt: new Date().toISOString(),
    node: process.version,
    requestedNodeVersion,
    nodeVersionMatchesRequest: process.version === `v${requestedNodeVersion}`,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? null,
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    currentDistributionSize: DX_DISTRIBUTION_SIZE,
  },
  tailBounds: [
    { dice: 99, critical: 2, shihai: 0, yousei: 0, epsilon: 1e-6 },
    { dice: 99, critical: 2, shihai: 0, yousei: 0, epsilon: 1e-8 },
    { dice: 99, critical: 8, shihai: 0, yousei: 0, epsilon: 1e-8 },
    { dice: 200, critical: 2, shihai: 19, yousei: 0, epsilon: 1e-8 },
    { dice: 99, critical: 2, shihai: 0, yousei: 9, epsilon: 1e-8 },
  ].map((item) => {
    const params = item
    const cutoff = findTailCutoff(params, item.epsilon)
    return {
      ...item,
      model: params.yousei > 0 && params.shihai === 0
        ? 'exact-yousei'
        : params.yousei > 0
          ? 'conservative-union-bound'
          : params.shihai === 0
            ? 'exact-max'
            : 'conservative-max-bound',
      cutoff: cutoff.cutoff,
      bound: cutoff.bound,
      ...(params.yousei > 0 && params.shihai === 0
        ? {
            legacyUnionBound: findCutoffWithEvaluator(
              params,
              item.epsilon,
              legacyYouseiUnionTailBound,
            ),
          }
        : {}),
    }
  }),
  currentSupportTailBounds: [
    { dice: 99, critical: 2, shihai: 0, yousei: 0, supportMax: 2047 },
    { dice: 99, critical: 8, shihai: 0, yousei: 0, supportMax: 2047 },
    { dice: 99, critical: 2, shihai: 0, yousei: 9, supportMax: 2047 },
  ].map((item) => ({
    ...item,
    bound: scoreTailBound(item.supportMax, item),
  })),
  benchmarks: [
    ...dxCases.map(({ label, params, size, iterations, operation }) => ({
      ...measure(label, iterations, operation),
      params,
      size,
      workingFloat64Bytes: (params.shihai === 0 ? 1 : params.dice + 1) *
        size * Float64Array.BYTES_PER_ELEMENT,
    })),
    ...fftCases.map(({ label, size, iterations, operation }) => ({
      ...measure(label, iterations, operation),
      size,
      fftFloat64Bytes: 2 * size * Float64Array.BYTES_PER_ELEMENT,
    })),
    ...damageCases.map(({ label, maxDamageDice, kazanari, fftSize, iterations, operation }) => ({
      ...measure(label, iterations, operation),
      maxDamageDice,
      kazanari,
      fftSize,
      fftFloat64Bytes: 2 * fftSize * Float64Array.BYTES_PER_ELEMENT,
    })),
  ],
  plannerCases: plans,
}

console.log(JSON.stringify(result, null, 2))
if (process.argv.includes('--write-results')) {
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.error(`Wrote ${output.pathname}`)
}
