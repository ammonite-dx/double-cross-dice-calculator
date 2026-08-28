import os from 'node:os'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'

import { BENCHMARK_CASES, UI_LIMITS } from './benchmark-cases.mjs'

let calculateDxDistribution
let DX_DISTRIBUTION_SIZE
let calculateCoreScore
let calculateScore
let getScoreSummary
let calculateDamageOnDemand
let getDamageSummary
let calculateFinalEncroachment
let calculateD10Distributions
let calculateLivingdeadDistributions
let getTotalDamage
let expandSparseDistribution
let generateMixedDamageDistribution
let createCalculationClient
let planCalculationRanges

const WARMUP_ITERATIONS = 2
const WARM_ITERATIONS = 7

function round(value) {
  return Number(value.toFixed(6))
}

function percentile(sortedValues, probability) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(probability * sortedValues.length) - 1
  )
  return sortedValues[index]
}

function summarizeSamples(samples) {
  const sorted = samples.slice().sort((left, right) => left - right)
  return {
    sampleCount: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1)),
    meanMs: round(
      sorted.reduce((sum, value) => sum + value, 0) / sorted.length
    ),
  }
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value)
  }
  throw new TypeError('expected an Array or typed array')
}

function summarizeProbabilityArray(value, expectedTotal = 1) {
  const array = asArray(value)
  let total = 0
  let minimum = Infinity
  let maximum = -Infinity
  let nonFiniteCount = 0
  let negativeCount = 0
  for (const probability of array) {
    if (!Number.isFinite(probability)) {
      nonFiniteCount += 1
      continue
    }
    total += probability
    minimum = Math.min(minimum, probability)
    maximum = Math.max(maximum, probability)
    if (probability < -1e-10) {
      negativeCount += 1
    }
  }
  const tolerance = 1e-8 * Math.max(1, Math.abs(expectedTotal))
  if (
    array.length === 0 ||
    nonFiniteCount > 0 ||
    negativeCount > 0 ||
    Math.abs(total - expectedTotal) > tolerance
  ) {
    throw new Error(`invalid probability array: ${JSON.stringify({
      length: array.length,
      total,
      expectedTotal,
      nonFiniteCount,
      negativeCount,
    })}`)
  }
  return {
    length: array.length,
    byteLength: value?.byteLength ?? null,
    total: round(total),
    minimum: round(minimum),
    maximum: round(maximum),
    nonFiniteCount,
    negativeCount,
  }
}

function summarizeNumericArray(value) {
  const array = asArray(value)
  let minimum = Infinity
  let maximum = -Infinity
  let nonFiniteCount = 0
  let negativeCount = 0
  for (const number of array) {
    if (!Number.isFinite(number)) {
      nonFiniteCount += 1
      continue
    }
    minimum = Math.min(minimum, number)
    maximum = Math.max(maximum, number)
    if (number < -1e-10) {
      negativeCount += 1
    }
  }
  if (array.length === 0 || nonFiniteCount > 0 || negativeCount > 0) {
    throw new Error(`invalid numeric array: ${JSON.stringify({
      length: array.length,
      nonFiniteCount,
      negativeCount,
    })}`)
  }
  return {
    length: array.length,
    byteLength: value?.byteLength ?? null,
    minimum: round(minimum),
    maximum: round(maximum),
    nonFiniteCount,
    negativeCount,
  }
}

function summarizeScore(score) {
  return {
    action: summarizeProbabilityArray(score.action.distribution),
    reaction: score.reaction
      ? summarizeProbabilityArray(score.reaction.distribution)
      : null,
  }
}

function summarizeDamage(damage) {
  return {
    distribution: summarizeProbabilityArray(damage.distribution),
    upperTailProbability: summarizeNumericArray(
      damage.upperTailProbability
    ),
  }
}

function summarizeBacktrack(result) {
  const groups = {}
  for (const [name, values] of Object.entries(result)) {
    const summary = summarizeProbabilityArray(values, 100)
    groups[name] = summary
  }
  return groups
}

function summarizePlan(plan) {
  return {
    accepted: plan.accepted,
    operation: plan.operation,
    warnings: plan.warnings,
    rejectionReasons: plan.rejectionReasons ?? [],
    propagation: plan.propagation,
    display: plan.display,
    scores: plan.scores.map((score) => ({
      params: score.params,
      tailModel: score.tail.model,
      tailCutoff: score.tail.cutoff,
      tailBound: score.tail.bound,
      workingMax: score.workingMax,
      workingLength: score.workingLength,
      fftLength: score.fftLength,
      operations: score.operations,
      float64Bytes: score.float64Bytes,
    })),
    damage: plan.damage && {
      scoreValueMode: plan.damage.scoreValueMode,
      scoreValueUpperBound: plan.damage.scoreValueUpperBound,
      maxDamageDice: plan.damage.maxDamageDice,
      rawSupportMax: plan.damage.rawSupportMax,
      rawMax: plan.damage.rawMax,
      workingMax: plan.damage.workingMax,
      workingLength: plan.damage.workingLength,
      fftLength: plan.damage.fftLength,
      defenceFftLength: plan.damage.defenceFftLength,
      operations: plan.damage.operations,
      float64Bytes: plan.damage.float64Bytes,
    },
    backtrack: plan.backtrack && {
      params: plan.backtrack.params,
      diceCounts: plan.backtrack.diceCounts,
      maxDice: plan.backtrack.maxDice,
      rawSupportMax: plan.backtrack.rawSupportMax,
      workingMax: plan.backtrack.workingMax,
      workingLength: plan.backtrack.workingLength,
      fftLength: plan.backtrack.fftLength,
      assetOverflow: plan.backtrack.assetOverflow,
      assetOverflowLowerBound: plan.backtrack.assetOverflowLowerBound,
      distributionMode: plan.backtrack.distributionMode,
      operations: plan.backtrack.operations,
      float64Bytes: plan.backtrack.float64Bytes,
    },
    estimates: plan.estimates,
  }
}

function makeWeights(maxDamageDice) {
  const weights = new Float64Array(maxDamageDice + 1)
  for (let dice = 0; dice < weights.length; dice += 1) {
    const distance = dice - Math.min(24, maxDamageDice / 3)
    weights[dice] = Math.exp(-(distance * distance) / 72)
  }
  const total = weights.reduce((sum, value) => sum + value, 0)
  for (let dice = 0; dice < weights.length; dice += 1) {
    weights[dice] /= total
  }
  return weights
}

function createAssetProvider(asset) {
  const cache = new Map()
  return (dice, size) => {
    const key = `${dice}:${size}`
    if (!cache.has(key)) {
      const sparse = asset.distributions[dice]
      if (!sparse) {
        throw new RangeError(`asset distribution is unavailable for dice=${dice}`)
      }
      cache.set(key, expandSparseDistribution(sparse, size))
    }
    return cache.get(key)
  }
}

function createGeneratedProvider(generator) {
  const cache = new Map()
  return (dice, size) => {
    const key = `${dice}:${size}`
    if (!cache.has(key)) {
      const generated = generator([dice], size)
      cache.set(key, generated.get(dice))
    }
    return cache.get(key)
  }
}

function createBenchmarkClient({ d10Provider, livingdeadProvider }) {
  return createCalculationClient({
    calculateDamageOnDemand,
    calculateDxDistribution,
    calculateScore,
    getDamageSummary,
    getDamageRollDistribution: generateMixedDamageDistribution,
    getFinalEncroachment: (params, runtimeOptions, backtrackRangePlan) =>
      calculateFinalEncroachment(
        params,
        {
          getD10Distribution: d10Provider,
          getLivingdeadDistribution: livingdeadProvider,
        },
        runtimeOptions,
        backtrackRangePlan
      ),
    getD10Distribution: d10Provider,
    getScoreSummary,
    getTotalDamage,
    loadD10Asset: async () => undefined,
    loadLivingdeadAsset: async () => undefined,
    planCalculationRanges,
  })
}

function createOperation(testCase, plan, client) {
  if (testCase.kind === 'dx') {
    const scorePlan = plan.scores[0]
    return () => calculateDxDistribution(
      testCase.params,
      {
        workingLength: scorePlan.workingLength,
        rounding: 'unrounded',
      }
    )
  }

  if (testCase.kind === 'score') {
    const scorePlan = plan.scores[0]
    return () => calculateCoreScore(
      testCase.params,
      {
        getDxDistribution: (shihai, dice, critical, options) =>
          calculateDxDistribution(
            { dice, critical, shihai },
            options
          ),
      },
      false,
      scorePlan
    )
  }

  if (testCase.kind === 'dr') {
    const weights = makeWeights(testCase.params.maxDamageDice)
    const damagePlan = plan.damage
    const options = {
      fftLength: damagePlan.fftLength,
      distributionLength: Math.min(DX_DISTRIBUTION_SIZE, damagePlan.fftLength),
      rawSupportMax: 10 * testCase.params.maxDamageDice,
    }
    return () => generateMixedDamageDistribution(
      weights,
      testCase.params.kazanari,
      options
    )
  }

  if (testCase.kind === 'attack') {
    return () => client.calculateAttackCombo(testCase.params)
  }

  if (testCase.kind === 'combos') {
    return async () => {
      const combos = []
      for (const params of testCase.params) {
        combos.push(await client.calculateAttackCombo(params))
      }
      const totalDamage = await client.calculateTotalDamage(
        combos.map((combo) => ({ data: combo }))
      )
      return { combos, totalDamage }
    }
  }

  if (testCase.kind === 'backtrack') {
    return () => client.calculateBacktrack(testCase.params)
  }

  throw new Error(`unknown benchmark case kind: ${testCase.kind}`)
}

function summarizeResult(testCase, result) {
  if (testCase.kind === 'dx') {
    return summarizeProbabilityArray(result)
  }
  if (testCase.kind === 'score') {
    return {
      distribution: summarizeProbabilityArray(result.distribution),
      upperTailProbability: summarizeNumericArray(
        result.upperTailProbability
      ),
    }
  }
  if (testCase.kind === 'dr') {
    return summarizeProbabilityArray(result)
  }
  if (testCase.kind === 'attack') {
    return {
      score: summarizeScore(result.score),
      damage: summarizeDamage(result.damage),
    }
  }
  if (testCase.kind === 'combos') {
    return {
      comboCount: result.combos.length,
      combos: result.combos.map((combo) => ({
        score: summarizeScore(combo.score),
        damage: summarizeDamage(combo.damage),
      })),
      totalDamage: summarizeDamage(result.totalDamage.totalDamage),
    }
  }
  if (testCase.kind === 'backtrack') {
    return summarizeBacktrack(result)
  }
  throw new Error(`unknown benchmark case kind: ${testCase.kind}`)
}

async function timed(operation) {
  const started = performance.now()
  const result = await operation()
  return {
    result,
    milliseconds: performance.now() - started,
  }
}

async function measureOperation(testCase, operation) {
  const cold = await timed(operation)
  const coldResult = summarizeResult(testCase, cold.result)

  for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) {
    await operation()
  }

  const samples = []
  let lastResult = coldResult
  for (let iteration = 0; iteration < WARM_ITERATIONS; iteration += 1) {
    const sample = await timed(operation)
    samples.push(sample.milliseconds)
    lastResult = summarizeResult(testCase, sample.result)
  }

  return {
    cold: {
      milliseconds: round(cold.milliseconds),
      result: coldResult,
    },
    warm: {
      ...summarizeSamples(samples),
      result: lastResult,
    },
  }
}

async function readAsset(relativePath) {
  return JSON.parse(
    await readFile(new URL(`../../public/data/schema-v2/revision-1/${relativePath}`, import.meta.url), 'utf8')
  )
}

function makePlanner(testCase) {
  return planCalculationRanges(testCase.planner)
}

async function main() {
  const [d10Asset, livingdeadAsset] = await Promise.all([
    readAsset('d10.json'),
    readAsset('livingdead.json'),
  ])
  const d10AssetProvider = createAssetProvider(d10Asset)
  const livingdeadAssetProvider = createAssetProvider(livingdeadAsset)
  const d10GeneratedProvider = createGeneratedProvider(calculateD10Distributions)
  const livingdeadGeneratedProvider = createGeneratedProvider(
    calculateLivingdeadDistributions
  )
  const d10Provider = (dice, size) =>
    size <= 2048
      ? d10AssetProvider(dice, size)
      : d10GeneratedProvider(dice, size)
  const livingdeadProvider = (dice, size) =>
    size <= 2048
      ? livingdeadAssetProvider(dice, size)
      : livingdeadGeneratedProvider(dice, size)
  const cases = []
  for (const testCase of BENCHMARK_CASES) {
    const plan = makePlanner(testCase)
    const entry = {
      id: testCase.id,
      label: testCase.label,
      kind: testCase.kind,
      tier: testCase.tier,
      coreLimit: testCase.coreLimit ?? null,
      planner: summarizePlan(plan),
      execution: {
        status: 'not-run',
        reason: null,
      },
    }

    if (testCase.coreLimit) {
      entry.execution.reason = `skipped: ${testCase.coreLimit}`
      cases.push(entry)
      continue
    }

    try {
      const client = createBenchmarkClient({ d10Provider, livingdeadProvider })
      const operation = createOperation(testCase, plan, client)
      entry.execution.status = 'measured'
      entry.execution.measurement = await measureOperation(testCase, operation)
    } catch (error) {
      entry.execution.status = 'error'
      entry.execution.reason = String(error?.stack ?? error)
    }
    cases.push(entry)
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    nodeExecutable: process.execPath,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model?.trim() ?? null,
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    warmupIterations: WARMUP_ITERATIONS,
    warmIterations: WARM_ITERATIONS,
    currentDistributionSize: DX_DISTRIBUTION_SIZE,
    uiLimits: UI_LIMITS,
    note: 'Node measurements are a baseline; browser Worker round-trip, event-loop delay, and device variability require the browser page.',
  }
  console.log(JSON.stringify({ metadata, cases }, null, 2))
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const dxModule = await server.ssrLoadModule('/src/calculation/DxCalculator.js')
  calculateDxDistribution = dxModule.calculateDxDistribution
  DX_DISTRIBUTION_SIZE = dxModule.DX_DISTRIBUTION_SIZE

  const scoreCoreModule = await server.ssrLoadModule('/src/calculation/ScoreCalculator.js')
  calculateCoreScore = scoreCoreModule.calculateScore
  getScoreSummary = scoreCoreModule.getScoreSummary
  const referenceRepository = await server.ssrLoadModule(
    '/src/data/ReferencePrecomputedDataRepository.js'
  )
  calculateScore = (
    params,
    getDistribution = referenceRepository.getDxDistribution,
    fix = false,
    scoreRangePlan
  ) =>
    calculateCoreScore(
      params,
      {
        getDxDistribution: getDistribution,
      },
      fix,
      scoreRangePlan
    )

  const damageModule = await server.ssrLoadModule('/src/calculation/DamageCalculator.js')
  calculateDamageOnDemand = damageModule.calculateDamageOnDemand
  getDamageSummary = damageModule.getDamageSummary

  const backtrackModule = await server.ssrLoadModule('/src/calculation/BacktrackCalculator.js')
  calculateFinalEncroachment = backtrackModule.calculateFinalEncroachment
  calculateD10Distributions = backtrackModule.calculateD10Distributions
  calculateLivingdeadDistributions = backtrackModule.calculateLivingdeadDistributions

  getTotalDamage = damageModule.getTotalDamage

  const distributionModule = await server.ssrLoadModule('/src/data/Distribution.js')
  expandSparseDistribution = distributionModule.expandSparseDistribution

  const runtimeDamageModule = await server.ssrLoadModule('/src/calculation/RuntimeDamageRollCalculator.js')
  generateMixedDamageDistribution = runtimeDamageModule.generateMixedDamageDistribution

  const clientModule = await server.ssrLoadModule('/src/application/CalculationClient.js')
  createCalculationClient = clientModule.createCalculationClient

  const plannerModule = await server.ssrLoadModule('/src/calculation/RangePlanner.js')
  planCalculationRanges = plannerModule.planCalculationRanges

  await main()
} finally {
  await server.close()
}
