import {
  calculateDxDistribution,
  DX_DISTRIBUTION_SIZE,
} from '../../src/calculation/DxCalculator.js'
import {
  calculateDamageOnDemand,
} from '../../src/calculation/DamageCalculator.js'
import {
  calculateScore as calculateCoreScore,
} from '../../src/calculation/ScoreCalculator.js'
import {
  generateMixedDamageDistribution,
} from '../../src/calculation/RuntimeDamageRollCalculator.js'
import {
  getFinalEncroachment,
} from '../../src/data/BacktrackCalculator.js'
import {
  getDamageSummary,
  getTotalDamage,
} from '../../src/data/DamageCalculator.js'
import {
  getD10Distribution,
  loadD10Asset,
  loadLivingdeadAsset,
} from '../../src/data/PrecomputedDataRepository.js'
import {
  calculateScore,
  getScoreSummary,
} from '../../src/data/ScoreCalculator.js'
import {
  createCalculationClient,
} from '../../src/application/CalculationClient.js'
import {
  createRuntimeDamageRollClient,
} from '../../src/application/RuntimeDamageRollClient.js'
import {
  planCalculationRanges,
} from '../../src/calculation/RangePlanner.js'
import {
  BENCHMARK_CASES,
  BROWSER_CASES,
  UI_LIMITS,
} from './benchmark-cases.mjs'

const WARMUP_ITERATIONS = 2
const WARM_ITERATIONS = 7
const TOTAL_TOLERANCE = 1e-8

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const longTaskEntries = []
const pageErrors = []
let longTaskObserver = null

window.addEventListener('error', (event) => {
  pageErrors.push({
    type: 'error',
    message: event.message,
    source: event.filename,
    line: event.lineno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  pageErrors.push({
    type: 'unhandledrejection',
    message: String(event.reason?.stack ?? event.reason),
  })
})

const longTaskSupported =
  typeof PerformanceObserver !== 'undefined' &&
  PerformanceObserver.supportedEntryTypes.includes('longtask')

if (longTaskSupported) {
  const observer = new PerformanceObserver((list) => {
    recordLongTasks(list.getEntries())
  })
  observer.observe({ entryTypes: ['longtask'] })
  longTaskObserver = observer
}

function recordLongTasks(entries) {
  for (const entry of entries) {
    longTaskEntries.push({
      durationMilliseconds: entry.duration,
      startTime: entry.startTime,
    })
  }
}

function setStatus(message) {
  statusElement.textContent = message
}

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
    minMilliseconds: round(sorted[0]),
    medianMilliseconds: round(percentile(sorted, 0.5)),
    p95Milliseconds: round(percentile(sorted, 0.95)),
    maxMilliseconds: round(sorted.at(-1)),
    meanMilliseconds: round(
      sorted.reduce((sum, value) => sum + value, 0) / sorted.length
    ),
  }
}

function summarizeLongTasks(startIndex) {
  const entries = longTaskEntries.slice(startIndex)
  return {
    count: entries.length,
    maxMilliseconds: entries.length === 0
      ? 0
      : round(Math.max(...entries.map((entry) => entry.durationMilliseconds))),
    entries,
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

  const allowedError = TOTAL_TOLERANCE * Math.max(1, Math.abs(expectedTotal))
  if (
    array.length === 0 ||
    nonFiniteCount > 0 ||
    negativeCount > 0 ||
    Math.abs(total - expectedTotal) > allowedError
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
    groups[name] = summarizeProbabilityArray(values, 100)
  }
  return groups
}

function summarizeResult(testCase, result) {
  if (testCase.kind === 'dx' || testCase.kind === 'dr') {
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

function getCasePlan(testCase) {
  return planCalculationRanges(testCase.planner)
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

function createWorkerClient() {
  let workerCreatedCount = 0
  const runtimeClient = createRuntimeDamageRollClient({
    cacheSize: 0,
    workerFactory: () => {
      workerCreatedCount += 1
      return new Worker(
        new URL('../../src/application/RuntimeDamageRollWorker.js', import.meta.url),
        { type: 'module' }
      )
    },
  })

  return {
    runtimeClient,
    get workerCreatedCount() {
      return workerCreatedCount
    },
  }
}

function createClient(getDamageRollDistribution) {
  return createCalculationClient({
    calculateDamageOnDemand,
    calculateDxDistribution,
    calculateScore,
    getDamageSummary,
    getDamageRollDistribution,
    getFinalEncroachment,
    getD10Distribution,
    getScoreSummary,
    getTotalDamage,
    loadD10Asset: async () => undefined,
    loadLivingdeadAsset: async () => undefined,
    planCalculationRanges,
  })
}

function createTrackedWorkerClient() {
  const workerClient = createWorkerClient()
  const transfer = {
    requestCount: 0,
    inputBytes: 0,
    outputBytes: 0,
    fftLengths: [],
    distributionLengths: [],
  }
  const calculate = async (weights, kazanari, options = {}) => {
    transfer.requestCount += 1
    transfer.inputBytes += weights.byteLength ?? 0
    transfer.fftLengths.push(options.fftLength ?? null)
    transfer.distributionLengths.push(options.distributionLength ?? null)
    const result = await workerClient.runtimeClient.calculate(
      weights,
      kazanari,
      options
    )
    transfer.outputBytes += result.byteLength ?? 0
    return result
  }
  return {
    runtimeClient: workerClient.runtimeClient,
    get workerCreatedCount() {
      return workerClient.workerCreatedCount
    },
    calculate,
    transfer,
  }
}

function createOperation(testCase, plan, { main = false } = {}) {
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
      distributionLength: Math.min(
        DX_DISTRIBUTION_SIZE,
        damagePlan.fftLength
      ),
      rawSupportMax: damagePlan.rawSupportMax,
    }
    if (main) {
      return () => generateMixedDamageDistribution(
        weights,
        testCase.params.kazanari,
        options
      )
    }
    throw new Error('DR Worker operation requires a tracked client')
  }

  if (testCase.kind === 'attack') {
    return (client) => () => client.calculateAttackCombo(testCase.params)
  }

  if (testCase.kind === 'combos') {
    return (client) => async () => {
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
    return (client) => () => client.calculateBacktrack(testCase.params)
  }

  throw new Error(`unknown benchmark case kind: ${testCase.kind}`)
}

function timed(operation) {
  const started = performance.now()
  let timerFiredAt = null
  const timer = new Promise((resolve) => {
    setTimeout(() => {
      timerFiredAt = performance.now()
      resolve()
    }, 0)
  })

  return Promise.resolve()
    .then(operation)
    .then(async (result) => {
      const finished = performance.now()
      await timer
      return {
        result,
        milliseconds: finished - started,
        mainThreadTimerDelayApproxMilliseconds: Math.max(
          0,
          (timerFiredAt ?? finished) - started
        ),
      }
    })
}

async function settleMeasurement() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (longTaskObserver) {
    recordLongTasks(longTaskObserver.takeRecords())
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (longTaskObserver) {
    recordLongTasks(longTaskObserver.takeRecords())
  }
}

async function measureOperation(testCase, operation) {
  const longTaskStart = longTaskEntries.length
  const cold = await timed(operation)
  const coldSummary = summarizeResult(testCase, cold.result)

  for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) {
    const warmup = await timed(operation)
    summarizeResult(testCase, warmup.result)
  }

  const elapsedSamples = []
  const timerDelaySamples = []
  let lastSummary = coldSummary
  for (let iteration = 0; iteration < WARM_ITERATIONS; iteration += 1) {
    const sample = await timed(operation)
    elapsedSamples.push(sample.milliseconds)
    timerDelaySamples.push(sample.mainThreadTimerDelayApproxMilliseconds)
    lastSummary = summarizeResult(testCase, sample.result)
  }
  await settleMeasurement()

  return {
    cold: {
      milliseconds: round(cold.milliseconds),
      mainThreadTimerDelayApproxMilliseconds: round(
        cold.mainThreadTimerDelayApproxMilliseconds
      ),
      result: coldSummary,
    },
    warm: {
      ...summarizeSamples(elapsedSamples),
      mainThreadTimerDelayApproxMilliseconds: summarizeSamples(timerDelaySamples),
      result: lastSummary,
    },
    longTasks: summarizeLongTasks(longTaskStart),
  }
}

function getDamageTransferSummary(transfer) {
  return {
    requestCount: transfer.requestCount,
    inputBytes: transfer.inputBytes,
    outputBytes: transfer.outputBytes,
    fftLengths: [...new Set(transfer.fftLengths)],
    distributionLengths: [...new Set(transfer.distributionLengths)],
  }
}

async function measureMainCase(testCase, plan) {
  const operationFactory = createOperation(testCase, plan, { main: true })
  if (testCase.kind === 'attack' || testCase.kind === 'combos' ||
      testCase.kind === 'backtrack') {
    const client = createClient(generateMixedDamageDistribution)
    return {
      path: 'main-thread',
      measurement: await measureOperation(
        testCase,
        operationFactory(client)
      ),
      worker: null,
    }
  }
  return {
    path: 'main-thread',
    measurement: await measureOperation(testCase, operationFactory),
    worker: null,
  }
}

async function measureWorkerCase(testCase, plan) {
  const workerClient = createTrackedWorkerClient()
  const client = createClient(workerClient.calculate)
  let operation

  if (testCase.kind === 'dr') {
    const weights = makeWeights(testCase.params.maxDamageDice)
    const damagePlan = plan.damage
    const options = {
      fftLength: damagePlan.fftLength,
      distributionLength: Math.min(
        DX_DISTRIBUTION_SIZE,
        damagePlan.fftLength
      ),
      rawSupportMax: damagePlan.rawSupportMax,
    }
    operation = () => workerClient.calculate(
      weights,
      testCase.params.kazanari,
      options
    )
  } else if (testCase.kind === 'attack' || testCase.kind === 'combos') {
    operation = createOperation(testCase, plan)(client)
  } else {
    workerClient.runtimeClient.dispose()
    return null
  }

  try {
    const measurement = await measureOperation(testCase, operation)
    return {
      path: 'worker-round-trip',
      measurement,
      worker: {
        createdCount: workerClient.workerCreatedCount,
        coldStartIncludedMilliseconds:
          workerClient.workerCreatedCount > 0
            ? measurement.cold.milliseconds
            : 0,
        transfer: getDamageTransferSummary(workerClient.transfer),
      },
    }
  } finally {
    workerClient.runtimeClient.dispose()
  }
}

function getResourceDiagnostics() {
  const resources = performance.getEntriesByType('resource').map((entry) => {
    const validDuration = Number.isFinite(entry.duration) && entry.duration >= 0
    const workerResource = entry.name.includes('RuntimeDamageRollWorker')
    const timingStatus = validDuration
      ? 'valid'
      : workerResource
        ? 'unavailable-for-worker-resource'
        : 'invalid-duration'
    return {
      name: entry.name,
      initiatorType: entry.initiatorType,
      durationMilliseconds: validDuration ? round(entry.duration) : null,
      timingStatus,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }
  })
  return {
    resourceCount: resources.length,
    timingAnomalyCount: resources.filter((entry) =>
      entry.timingStatus === 'invalid-duration'
    ).length,
    timingUnavailableCount: resources.filter((entry) =>
      entry.timingStatus === 'unavailable-for-worker-resource'
    ).length,
    workerResources: resources.filter((entry) =>
      entry.name.includes('RuntimeDamageRollWorker')
    ),
    resources,
  }
}

function getEnvironment() {
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    crossOriginIsolated: globalThis.crossOriginIsolated,
    longTaskSupported,
  }
}

async function run() {
  const started = performance.now()
  setStatus('Preloading D10 and livingdead assets...')
  const assetLoadStarted = performance.now()
  await Promise.all([loadD10Asset(), loadLivingdeadAsset()])
  const assetPreloadMilliseconds = performance.now() - assetLoadStarted

  const cases = []
  for (const testCase of BENCHMARK_CASES) {
    setStatus(`Measuring ${testCase.id}...`)
    const plan = getCasePlan(testCase)
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
        paths: {},
      },
    }

    if (!testCase.browser) {
      entry.execution.reason = testCase.coreLimit
        ? `skipped: ${testCase.coreLimit}`
        : 'skipped: browser benchmark disabled for this case'
      cases.push(entry)
      continue
    }

    try {
      const mainResult = await measureMainCase(testCase, plan)
      entry.execution.paths.main = mainResult

      const workerResult = await measureWorkerCase(testCase, plan)
      if (workerResult) {
        entry.execution.paths.worker = workerResult
      }
      entry.execution.status = 'measured'
    } catch (error) {
      entry.execution.status = 'error'
      entry.execution.reason = String(error?.stack ?? error)
    }
    cases.push(entry)
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      benchmark: 'dynamic-distribution-ranges-phase2f',
      warmupIterations: WARMUP_ITERATIONS,
      warmIterations: WARM_ITERATIONS,
      currentDistributionSize: DX_DISTRIBUTION_SIZE,
      uiLimits: UI_LIMITS,
      caseCounts: {
        total: BENCHMARK_CASES.length,
        browser: BROWSER_CASES.length,
        measured: cases.filter((entry) =>
          entry.execution.status === 'measured'
        ).length,
        skipped: cases.filter((entry) =>
          entry.execution.status === 'not-run'
        ).length,
        errors: cases.filter((entry) =>
          entry.execution.status === 'error'
        ).length,
      },
      environment: getEnvironment(),
      assetPreloadMilliseconds: round(assetPreloadMilliseconds),
      elapsedMilliseconds: round(performance.now() - started),
      note: 'Worker paths include postMessage transfer and worker startup. mainThreadTimerDelayApproxMilliseconds is the delay of a queued zero-delay timer, not CPU blocking time; browser timer clamping commonly gives it a roughly 4-5 ms floor.',
    },
    cases,
    diagnostics: {
      pageErrors,
      resources: getResourceDiagnostics(),
    },
  }

  window.__dynamicRangeBenchmarkResult = report
  resultElement.textContent = JSON.stringify(report, null, 2)
  setStatus('Benchmark complete.')
}

run().catch((error) => {
  window.__dynamicRangeBenchmarkError = String(error?.stack ?? error)
  setStatus('Benchmark failed.')
  resultElement.textContent = window.__dynamicRangeBenchmarkError
})
