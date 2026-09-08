import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import {
  createProbabilityChartProjection,
  materializeProbabilityChartProjection,
} from '../../src/shared/presentation/ProbabilityChartProjection.js'

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
)

const REPORT_SCHEMA_VERSION = 1
const DEFAULT_CASES = [100, 1_000, 4_096, 16_384, 20_000]
const DEFAULT_ITERATIONS = 3
const DEFAULT_WARMUP = 1

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const pageErrors = []
const longTaskEntries = []

window.addEventListener('error', (event) => {
  pageErrors.push({
    message: event.message,
    source: event.filename || null,
    line: event.lineno || null,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  pageErrors.push({
    message: String(event.reason?.stack ?? event.reason),
    source: 'unhandledrejection',
  })
})

const longTaskSupported = typeof PerformanceObserver !== 'undefined'
  && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask')
if (longTaskSupported) {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskEntries.push({
          durationMs: round(entry.duration),
          startTimeMs: round(entry.startTime),
        })
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch (error) {
    pageErrors.push({ message: String(error), source: 'longtask-observer' })
  }
}

function round(value) {
  return Number(value.toFixed(3))
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function percentile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(probability * sorted.length) - 1,
  )
  return sorted[index]
}

function summarize(values) {
  if (values.length === 0) {
    return null
  }
  return {
    sampleCount: values.length,
    medianMs: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(Math.max(...values)),
  }
}

function parseCount(value, fallback, name, maximum, allowZero = false) {
  if (value === null) {
    return fallback
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`)
  }
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count > maximum || (!allowZero && count < 1)) {
    throw new Error(`${name} must be ${allowZero ? '0' : '1'}..${maximum}`)
  }
  return count
}

function resolveOptions() {
  const query = new URLSearchParams(window.location.search)
  const cases = query.get('cases') === null
    ? DEFAULT_CASES
    : query.get('cases').split(',').map((value) => parseCount(value, 0, 'cases', 100_000, false))
  return {
    cases,
    iterations: parseCount(query.get('iterations'), DEFAULT_ITERATIONS, 'iterations', 20),
    warmup: parseCount(query.get('warmup'), DEFAULT_WARMUP, 'warmup', 20, true),
    maxRenderedPoints: parseCount(query.get('budget'), 512, 'budget', 10_000),
  }
}

function createDisplay(pointCount) {
  const probabilities = new Float64Array(pointCount)
  const probability = 1 / pointCount
  probabilities.fill(probability)
  return {
    version: 1,
    kind: 'canonical-distribution-display',
    explicit: { offset: 0, probabilities },
    explicitMax: pointCount - 1,
    support: { kind: 'finite', max: pointCount - 1 },
    overflow: null,
  }
}

function createPlan(pointCount) {
  return {
    version: 1,
    kind: 'display-range-plan',
    status: 'ready',
    accepted: true,
    decision: 'reuse',
    displayWindow: { min: 0, max: pointCount - 1 },
  }
}

function createDenseData(display) {
  const values = display.explicit.probabilities
  return {
    labels: Array.from({ length: values.length }, (_, index) => index),
    datasets: [{
      data: Array.from(values, (value) => value * 100),
    }],
  }
}

function measureChart(data, type) {
  // Production materializers freeze semantic payloads. Chart.js owns and
  // mutates its input model, so benchmark the renderer with an owned copy.
  const chartData = structuredClone(data)
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 300
  document.body.append(canvas)
  const started = performance.now()
  const chart = new Chart(canvas, {
    type,
    data: chartData,
      options: {
        animation: false,
        responsive: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  })
  chart.update('none')
  const elapsedMs = performance.now() - started
  const pointCount = chart.data.datasets.reduce(
    (total, dataset) => total + dataset.data.length,
    0,
  )
  chart.destroy()
  canvas.remove()
  return { elapsedMs, pointCount }
}

function measureCase(pointCount, options) {
  const display = createDisplay(pointCount)
  const plan = createPlan(pointCount)
  const denseBuildSamples = []
  const denseChartSamples = []
  const projectionBuildSamples = []
  const projectionChartSamples = []
  let projectedPointCount = 0
  let projectedKind = null

  const run = () => {
    let started = performance.now()
    const denseData = createDenseData(display)
    denseBuildSamples.push(performance.now() - started)
    const denseChart = measureChart(denseData, 'line')
    denseChartSamples.push(denseChart.elapsedMs)

    started = performance.now()
    const projection = createProbabilityChartProjection(display, plan, {
      mode: 'pmf',
      maxRenderedPoints: options.maxRenderedPoints,
    })
    const projectedData = materializeProbabilityChartProjection(projection)
    projectionBuildSamples.push(performance.now() - started)
    projectedPointCount = projection.renderedPointCount
    projectedKind = projection.kind
    const projectedChart = measureChart(projectedData, 'bar')
    projectionChartSamples.push(projectedChart.elapsedMs)
  }

  for (let index = 0; index < options.warmup; index += 1) {
    run()
  }
  denseBuildSamples.length = 0
  denseChartSamples.length = 0
  projectionBuildSamples.length = 0
  projectionChartSamples.length = 0
  for (let index = 0; index < options.iterations; index += 1) {
    run()
  }

  return {
    pointCount,
    maxRenderedPoints: options.maxRenderedPoints,
    dense: {
      dataPoints: pointCount,
      build: summarize(denseBuildSamples),
      chart: summarize(denseChartSamples),
    },
    projected: {
      dataPoints: projectedPointCount,
      projectionKind: projectedKind,
      build: summarize(projectionBuildSamples),
      chart: summarize(projectionChartSamples),
    },
  }
}

async function runBenchmark() {
  const options = resolveOptions()
  statusElement.textContent = '旧dense系列と投影系列を測定しています...'
  await delay(0)
  const cases = options.cases.map((pointCount) => measureCase(pointCount, options))
  const result = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    browser: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      longTaskSupported,
    },
    options,
    cases,
    longTasks: longTaskEntries,
    pageErrors,
  }
  window.__r20ChartRenderingResult = result
  resultElement.textContent = JSON.stringify(result, null, 2)
  statusElement.textContent = pageErrors.length === 0
    ? 'Benchmark complete.'
    : 'Benchmark completed with diagnostics.'
}

runBenchmark().catch((error) => {
  const result = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    pageErrors: [...pageErrors, { message: String(error?.stack ?? error), source: 'runner' }],
  }
  window.__r20ChartRenderingError = result
  resultElement.textContent = JSON.stringify(result, null, 2)
  statusElement.textContent = 'Benchmark failed.'
})
