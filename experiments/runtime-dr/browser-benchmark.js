import { generateMixedDamageDistributionOptimized } from './optimized.js'
import { createRuntimeDamageRollClient } from './client.js'

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const longTasks = []
const workerClient = createRuntimeDamageRollClient({ cacheSize: 0 })

if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
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

function createWeights() {
  const weights = new Float64Array(203)
  for (let dice = 0; dice < weights.length; dice += 1) {
    const distance = dice - 24
    weights[dice] = Math.exp(-(distance * distance) / 72)
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0)
  for (let dice = 0; dice < weights.length; dice += 1) {
    weights[dice] /= total
  }
  return weights
}

function percentile(sortedValues, probability) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(probability * sortedValues.length) - 1
  )
  return sortedValues[index]
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function measureCase(weights, kazanari, iterations) {
  await nextFrame()
  const firstStarted = performance.now()
  generateMixedDamageDistributionOptimized(weights, kazanari)
  const firstMilliseconds = performance.now() - firstStarted

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await nextFrame()
    generateMixedDamageDistributionOptimized(weights, kazanari)
  }

  const samples = []
  const longTaskStart = longTasks.length
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await nextFrame()
    const started = performance.now()
    generateMixedDamageDistributionOptimized(weights, kazanari)
    samples.push(performance.now() - started)
  }
  await new Promise((resolve) => setTimeout(resolve, 0))

  const sortedSamples = samples.toSorted((left, right) => left - right)
  const observedLongTasks = longTasks.slice(longTaskStart)
  return {
    kazanari,
    iterations,
    firstMilliseconds,
    medianMilliseconds: percentile(sortedSamples, 0.5),
    p95Milliseconds: percentile(sortedSamples, 0.95),
    maxMilliseconds: sortedSamples.at(-1),
    longTaskCount: observedLongTasks.length,
    maxLongTaskMilliseconds: observedLongTasks.length === 0
      ? 0
      : Math.max(...observedLongTasks.map((entry) => entry.duration)),
  }
}

async function measureWorkerCase(weights, kazanari, iterations) {
  await nextFrame()
  const firstStarted = performance.now()
  await workerClient.calculate(weights, kazanari)
  const firstRoundTripMilliseconds = performance.now() - firstStarted

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await workerClient.calculate(weights, kazanari)
  }

  const roundTripSamples = []
  const longTaskStart = longTasks.length
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await nextFrame()
    const started = performance.now()
    await workerClient.calculate(weights, kazanari)
    roundTripSamples.push(performance.now() - started)
  }
  await new Promise((resolve) => setTimeout(resolve, 0))

  const sortedRoundTrips = roundTripSamples.toSorted(
    (left, right) => left - right
  )
  const observedLongTasks = longTasks.slice(longTaskStart)
  return {
    kazanari,
    iterations,
    firstRoundTripMilliseconds,
    medianRoundTripMilliseconds: percentile(sortedRoundTrips, 0.5),
    p95RoundTripMilliseconds: percentile(sortedRoundTrips, 0.95),
    maxRoundTripMilliseconds: sortedRoundTrips.at(-1),
    longTaskCount: observedLongTasks.length,
    maxLongTaskMilliseconds: observedLongTasks.length === 0
      ? 0
      : Math.max(...observedLongTasks.map((entry) => entry.duration)),
  }
}

async function run() {
  const weights = createWeights()
  const cases = Array.from(
    { length: 10 },
    (_, kazanari) => [kazanari, kazanari === 0 ? 50 : 10]
  )
  const results = []
  const workerResults = []

  for (const [kazanari, iterations] of cases) {
    statusElement.textContent = `kazanari=${kazanari}を測定しています。`
    results.push(await measureCase(weights, kazanari, iterations))
  }

  for (const [kazanari, iterations] of cases) {
    statusElement.textContent =
      `Web Workerでkazanari=${kazanari}を測定しています。`
    workerResults.push(
      await measureWorkerCase(weights, kazanari, iterations)
    )
  }

  const report = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
    crossOriginIsolated,
    mainThreadResults: results,
    workerResults,
  }
  workerClient.dispose()
  window.__runtimeDrBenchmarkResult = report
  resultElement.textContent = JSON.stringify(report, null, 2)
  statusElement.textContent = '測定が完了しました。'
}

run().catch((error) => {
  workerClient.dispose()
  window.__runtimeDrBenchmarkError = String(error?.stack ?? error)
  statusElement.textContent = '測定に失敗しました。'
  resultElement.textContent = window.__runtimeDrBenchmarkError
})
