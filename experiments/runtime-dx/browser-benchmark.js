import {
  calculateDxDistribution,
  DX_DISTRIBUTION_SIZE,
} from '../../src/calculation/DxCalculator.js'
import { createDxWorkerClient } from './client.js'

const WARMUP_ITERATIONS = 3
const WARM_ITERATIONS = 30
const CONTINUOUS_RUNS = 4
const TOTAL_TOLERANCE = 1e-8

const CASES = [
  {
    id: 'representative-shihai-0',
    label: 'shihai=0 representative',
    params: { dice: 20, critical: 8, shihai: 0 },
  },
  {
    id: 'representative-shihai-positive',
    label: 'shihai>0 representative',
    params: { dice: 20, critical: 8, shihai: 3 },
  },
  {
    id: 'maximum-shihai-0',
    label: 'shihai=0 maximum candidate',
    params: { dice: 99, critical: 2, shihai: 0 },
  },
  {
    id: 'maximum-shihai-positive',
    label: 'shihai>0 maximum candidate',
    params: { dice: 99, critical: 2, shihai: 19 },
  },
]

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const longTasks = []
const pageErrors = []

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
    for (const entry of list.getEntries()) {
      longTasks.push({
        duration: entry.duration,
        startTime: entry.startTime,
      })
    }
  })
  observer.observe({ entryTypes: ['longtask'] })
}

function setStatus(message) {
  statusElement.textContent = message
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
    medianMilliseconds: percentile(sorted, 0.5),
    p95Milliseconds: percentile(sorted, 0.95),
    maxMilliseconds: sorted.at(-1),
  }
}

function summarizeLongTasks(startIndex) {
  const entries = longTasks.slice(startIndex)
  return {
    count: entries.length,
    maxMilliseconds: entries.length === 0
      ? 0
      : Math.max(...entries.map((entry) => entry.duration)),
  }
}

function settleMeasurement() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function nextFrame() {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }
    requestAnimationFrame(finish)
    setTimeout(finish, 100)
  })
}

function validateDistribution(distribution) {
  if (
    !(distribution instanceof Float64Array) ||
    distribution.length !== DX_DISTRIBUTION_SIZE
  ) {
    throw new Error(
      `Expected a ${DX_DISTRIBUTION_SIZE}-element Float64Array distribution`
    )
  }

  let total = 0
  let nonFiniteCount = 0
  let negativeCount = 0
  let aboveOneCount = 0
  let minimum = Infinity
  let maximum = -Infinity
  for (const probability of distribution) {
    if (!Number.isFinite(probability)) {
      nonFiniteCount += 1
      continue
    }
    total += probability
    minimum = Math.min(minimum, probability)
    maximum = Math.max(maximum, probability)
    if (probability < 0) {
      negativeCount += 1
    }
    if (probability > 1) {
      aboveOneCount += 1
    }
  }

  if (
    nonFiniteCount > 0 ||
    negativeCount > 0 ||
    aboveOneCount > 0 ||
    Math.abs(total - 1) > TOTAL_TOLERANCE
  ) {
    throw new Error(`Invalid distribution: ${JSON.stringify({
      total,
      nonFiniteCount,
      negativeCount,
      aboveOneCount,
    })}`)
  }

  return {
    length: distribution.length,
    total,
    nonFiniteCount,
    negativeCount,
    aboveOneCount,
    minimum,
    maximum,
  }
}

function compareDistributions(expected, actual) {
  if (expected.length !== actual.length) {
    return {
      differentValueCount: actual.length,
      maxAbsoluteDifference: Infinity,
    }
  }

  let differentValueCount = 0
  let maxAbsoluteDifference = 0
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(expected[index] - actual[index])
    if (difference !== 0) {
      differentValueCount += 1
      maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference)
    }
  }
  return { differentValueCount, maxAbsoluteDifference }
}

function timedMainCalculation(params) {
  const started = performance.now()
  const distribution = calculateDxDistribution(params)
  return {
    distribution,
    milliseconds: performance.now() - started,
  }
}

async function measureMainCase(testCase) {
  setStatus(`Main thread: ${testCase.label}`)
  await nextFrame()

  const first = timedMainCalculation(testCase.params)
  const firstSummary = validateDistribution(first.distribution)
  const warmupComparisons = []
  for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) {
    await nextFrame()
    const warmup = timedMainCalculation(testCase.params)
    validateDistribution(warmup.distribution)
    warmupComparisons.push(
      compareDistributions(first.distribution, warmup.distribution)
    )
  }

  const samples = []
  const sampleComparisons = []
  const longTaskStart = longTasks.length
  for (let iteration = 0; iteration < WARM_ITERATIONS; iteration += 1) {
    await nextFrame()
    const sample = timedMainCalculation(testCase.params)
    validateDistribution(sample.distribution)
    samples.push(sample.milliseconds)
    sampleComparisons.push(
      compareDistributions(first.distribution, sample.distribution)
    )
  }
  await settleMeasurement()

  return {
    id: testCase.id,
    label: testCase.label,
    params: testCase.params,
    firstMainMilliseconds: first.milliseconds,
    warmupIterations: WARMUP_ITERATIONS,
    ...summarizeSamples(samples),
    longTasks: summarizeLongTasks(longTaskStart),
    distribution: firstSummary,
    repeatConsistency: summarizeComparisons([
      ...warmupComparisons,
      ...sampleComparisons,
    ]),
    referenceDistribution: first.distribution,
  }
}

async function measureWorkerCase(testCase, referenceDistribution) {
  setStatus(`Worker: ${testCase.label}`)
  const workerStart = performance.now()
  const client = createDxWorkerClient()

  try {
    const firstDistribution = await client.calculate(testCase.params)
    const workerColdStartIncludedMilliseconds = performance.now() - workerStart
    const firstSummary = validateDistribution(firstDistribution)
    const coldComparison = compareDistributions(
      referenceDistribution,
      firstDistribution
    )

    for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) {
      const warmupDistribution = await client.calculate(testCase.params)
      validateDistribution(warmupDistribution)
    }

    const samples = []
    const sampleComparisons = []
    const longTaskStart = longTasks.length
    for (let iteration = 0; iteration < WARM_ITERATIONS; iteration += 1) {
      await nextFrame()
      const started = performance.now()
      const distribution = await client.calculate(testCase.params)
      samples.push(performance.now() - started)
      validateDistribution(distribution)
      sampleComparisons.push(
        compareDistributions(referenceDistribution, distribution)
      )
    }
    await settleMeasurement()

    return {
      id: testCase.id,
      label: testCase.label,
      params: testCase.params,
      warmupIterations: WARMUP_ITERATIONS,
      workerColdStartIncludedMilliseconds,
      workerScriptUrl: client.workerUrl,
      workerReadyReceived: client.readyReceived,
      ...summarizeSamples(samples),
      longTasks: summarizeLongTasks(longTaskStart),
      distribution: firstSummary,
      resultMatch: summarizeComparisons([
        coldComparison,
        ...sampleComparisons,
      ]),
    }
  } finally {
    client.dispose()
  }
}

function summarizeComparisons(comparisons) {
  return comparisons.reduce(
    (summary, comparison) => ({
      differentValueCount: Math.max(
        summary.differentValueCount,
        comparison.differentValueCount
      ),
      maxAbsoluteDifference: Math.max(
        summary.maxAbsoluteDifference,
        comparison.maxAbsoluteDifference
      ),
    }),
    { differentValueCount: 0, maxAbsoluteDifference: 0 }
  )
}

function createContinuousSummary(samplesByCase, comparisonsByCase) {
  return CASES.map((testCase) => ({
    id: testCase.id,
    label: testCase.label,
    ...summarizeSamples(samplesByCase.get(testCase.id)),
    resultMatch: summarizeComparisons(comparisonsByCase.get(testCase.id)),
  }))
}

async function measureContinuousMain(referenceById) {
  setStatus('Main thread: continuous input sequence')
  const samplesByCase = new Map(
    CASES.map((testCase) => [testCase.id, []])
  )
  const comparisonsByCase = new Map(
    CASES.map((testCase) => [testCase.id, []])
  )
  const longTaskStart = longTasks.length

  await nextFrame()
  for (let run = 0; run < CONTINUOUS_RUNS; run += 1) {
    for (const testCase of CASES) {
      const sample = timedMainCalculation(testCase.params)
      validateDistribution(sample.distribution)
      samplesByCase.get(testCase.id).push(sample.milliseconds)
      comparisonsByCase.get(testCase.id).push(
        compareDistributions(
          referenceById.get(testCase.id),
          sample.distribution
        )
      )
    }
  }
  await settleMeasurement()

  return {
    mode: 'main-thread',
    runs: CONTINUOUS_RUNS,
    caseResults: createContinuousSummary(samplesByCase, comparisonsByCase),
    longTasks: summarizeLongTasks(longTaskStart),
  }
}

async function measureContinuousWorker(referenceById) {
  setStatus('Worker: continuous input sequence')
  const workerStart = performance.now()
  const client = createDxWorkerClient()
  const startupDistribution = await client.calculate(CASES[0].params)
  const workerColdStartIncludedMilliseconds = performance.now() - workerStart
  validateDistribution(startupDistribution)

  const samplesByCase = new Map(
    CASES.map((testCase) => [testCase.id, []])
  )
  const comparisonsByCase = new Map(
    CASES.map((testCase) => [testCase.id, []])
  )
  const longTaskStart = longTasks.length

  try {
    for (let run = 0; run < CONTINUOUS_RUNS; run += 1) {
      for (const testCase of CASES) {
        const started = performance.now()
        const distribution = await client.calculate(testCase.params)
        samplesByCase.get(testCase.id).push(performance.now() - started)
        validateDistribution(distribution)
        comparisonsByCase.get(testCase.id).push(
          compareDistributions(referenceById.get(testCase.id), distribution)
        )
      }
    }
    await settleMeasurement()

    return {
      mode: 'worker-round-trip',
      runs: CONTINUOUS_RUNS,
      workerColdStartIncludedMilliseconds,
      workerScriptUrl: client.workerUrl,
      workerReadyReceived: client.readyReceived,
      caseResults: createContinuousSummary(samplesByCase, comparisonsByCase),
      longTasks: summarizeLongTasks(longTaskStart),
    }
  } finally {
    client.dispose()
  }
}

function getResourceDiagnostics() {
  const resources = performance.getEntriesByType('resource').map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    durationMilliseconds: entry.duration,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize,
  }))
  return {
    resourceCount: resources.length,
    workerResources: resources.filter((entry) => entry.name.includes('/worker.js')),
    resources,
  }
}

async function run() {
  const started = performance.now()
  const mainResults = []
  const referenceById = new Map()

  for (const testCase of CASES) {
    const result = await measureMainCase(testCase)
    referenceById.set(testCase.id, result.referenceDistribution)
    delete result.referenceDistribution
    mainResults.push(result)
  }

  const workerResults = []
  for (const testCase of CASES) {
    workerResults.push(
      await measureWorkerCase(
        testCase,
        referenceById.get(testCase.id)
      )
    )
  }

  const continuousInput = {
    main: await measureContinuousMain(referenceById),
    worker: await measureContinuousWorker(referenceById),
  }

  const report = {
    benchmark: {
      warmupIterations: WARMUP_ITERATIONS,
      warmIterations: WARM_ITERATIONS,
      continuousRuns: CONTINUOUS_RUNS,
      distributionSize: DX_DISTRIBUTION_SIZE,
      elapsedMilliseconds: performance.now() - started,
    },
    environment: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      crossOriginIsolated: globalThis.crossOriginIsolated,
    },
    cases: CASES,
    mainThreadResults: mainResults,
    workerResults,
    continuousInput,
    diagnostics: {
      longTaskSupported,
      pageErrors,
      resources: getResourceDiagnostics(),
    },
  }

  window.__runtimeDxBenchmarkResult = report
  resultElement.textContent = JSON.stringify(report, null, 2)
  setStatus('Benchmark complete.')
}

run().catch((error) => {
  window.__runtimeDxBenchmarkError = String(error?.stack ?? error)
  setStatus('Benchmark failed.')
  resultElement.textContent = window.__runtimeDxBenchmarkError
})
