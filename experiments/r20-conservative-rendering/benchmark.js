import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { createProbabilityLineChartOptions } from '../../src/shared/chart/ProbabilityLineChartConfig.js'

Chart.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
)

const REPORT_SCHEMA_VERSION = 1
const DEFAULT_CASES = [100, 1_000, 4_096, 16_384, 20_000]
const DEFAULT_DATASET_COUNTS = [1, 2, 4]
const DEFAULT_MARKER_VARIANTS = ['baseline', 'radius-2', 'radius-1', 'radius-0']
const DEFAULT_ITERATIONS = 1
const DEFAULT_WARMUP = 0
const DEFAULT_INITIAL_ANIMATION_MS = 1_100
const DEFAULT_UPDATE_ANIMATION_MS = 1_100

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

function parseInteger(value, fallback, name, maximum, allowZero = false) {
  if (value === null) {
    return fallback
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`)
  }
  const parsed = Number(value)
  if (
    !Number.isSafeInteger(parsed)
    || parsed > maximum
    || (!allowZero && parsed < 1)
  ) {
    throw new Error(`${name} must be ${allowZero ? '0' : '1'}..${maximum}`)
  }
  return parsed
}

function parseList(value, fallback, name, parser) {
  if (value === null || value === '') {
    return fallback
  }
  return value.split(',').map((item) => parser(item, name))
}

function parseCase(item, name) {
  const value = parseInteger(item, null, name, 100_000)
  return value
}

function parseDatasetCount(item, name) {
  const value = parseInteger(item, null, name, 8)
  return value
}

function resolveOptions() {
  const query = new URLSearchParams(window.location.search)
  const cases = parseList(
    query.get('cases'),
    DEFAULT_CASES,
    'cases',
    parseCase,
  )
  const datasetCounts = parseList(
    query.get('datasets'),
    DEFAULT_DATASET_COUNTS,
    'datasets',
    parseDatasetCount,
  )
  const markerVariants = parseList(
    query.get('markers'),
    DEFAULT_MARKER_VARIANTS,
    'markers',
    (item) => {
      if (!DEFAULT_MARKER_VARIANTS.includes(item)) {
        throw new Error(`markers contains an unsupported variant: ${item}`)
      }
      return item
    },
  )
  return {
    cases,
    datasetCounts,
    markerVariants,
    iterations: parseInteger(
      query.get('iterations'),
      DEFAULT_ITERATIONS,
      'iterations',
      10,
    ),
    warmup: parseInteger(
      query.get('warmup'),
      DEFAULT_WARMUP,
      'warmup',
      10,
      true,
    ),
    initialAnimationMs: parseInteger(
      query.get('initialAnimationMs'),
      DEFAULT_INITIAL_ANIMATION_MS,
      'initialAnimationMs',
      5_000,
      true,
    ),
    updateAnimationMs: parseInteger(
      query.get('updateAnimationMs'),
      DEFAULT_UPDATE_ANIMATION_MS,
      'updateAnimationMs',
      5_000,
      true,
    ),
  }
}

function createChartData(pointCount, datasetCount, phase = 0) {
  const labels = Array.from({ length: pointCount }, (_, index) => index)
  const datasets = Array.from({ length: datasetCount }, (_, datasetIndex) => ({
    label: `系列${datasetIndex + 1}`,
    data: Array.from({ length: pointCount }, (_, index) => {
      const angle = (index + phase + datasetIndex * 19) / Math.max(pointCount, 1)
      return 50 + 40 * Math.sin(angle * Math.PI * 6)
    }),
  }))
  return { labels, datasets }
}

function createChartOptions(markerVariant, onAnimationComplete) {
  const displayOptions = createProbabilityLineChartOptions({
    xAxisTitle: '値',
    tooltipTitlePrefix: '値',
  })
  const options = {
    ...displayOptions,
    animation: { onComplete: onAnimationComplete },
  }
  if (markerVariant !== 'baseline') {
    const radius = Number(markerVariant.replace('radius-', ''))
    options.elements = {
      ...options.elements,
      point: {
        ...options.elements?.point,
        radius,
      },
    }
  }
  return options
}

function waitForAnimation(completionCount, previousCount, maximumMs) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let settled = false
    let timer = null
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
      resolve({
        completed: completionCount() > previousCount,
        observedMs: round(performance.now() - startedAt),
      })
    }
    if (maximumMs === 0) {
      finish()
      return
    }
    timer = setTimeout(finish, maximumMs)
    const check = () => {
      if (settled) {
        return
      }
      if (completionCount() > previousCount) {
        finish()
        return
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}

function startHeartbeat() {
  let previous = null
  let maxDelayMs = 0
  let frameCount = 0
  let active = true
  const tick = (timestamp) => {
    if (!active) {
      return
    }
    if (previous !== null) {
      maxDelayMs = Math.max(maxDelayMs, timestamp - previous - 16.667)
    }
    previous = timestamp
    frameCount += 1
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return {
    stop() {
      active = false
      return { frameCount, maxDelayMs: round(Math.max(0, maxDelayMs)) }
    },
  }
}

async function measureOne(pointCount, datasetCount, markerVariant, options) {
  const caseStartedAt = performance.now()
  let completionCount = 0
  const chartHost = document.createElement('div')
  chartHost.className = 'chart-host'
  const canvas = document.createElement('canvas')
  chartHost.append(canvas)
  document.body.append(chartHost)
  const heartbeat = startHeartbeat()
  const initialData = createChartData(pointCount, datasetCount)
  const chartOptions = createChartOptions(markerVariant, () => {
    completionCount += 1
  })
  const initialStartedAt = performance.now()
  const chart = new Chart(canvas, {
    type: 'line',
    data: initialData,
    options: chartOptions,
  })
  const initialCreateMs = performance.now() - initialStartedAt
  const initialAnimation = await waitForAnimation(
    () => completionCount,
    0,
    options.initialAnimationMs,
  )

  const nextData = createChartData(pointCount, datasetCount, 7)
  chart.data.datasets = nextData.datasets
  const beforeUpdateCount = completionCount
  const updateStartedAt = performance.now()
  chart.update()
  const updateInvokeMs = performance.now() - updateStartedAt
  const updateAnimation = await waitForAnimation(
    () => completionCount,
    beforeUpdateCount,
    options.updateAnimationMs,
  )
  await delay(0)
  const heartbeatResult = heartbeat.stop()
  const caseFinishedAt = performance.now()
  const caseLongTasks = longTaskEntries
    .filter((entry) => (
      entry.startTimeMs >= round(caseStartedAt)
      && entry.startTimeMs <= round(caseFinishedAt)
    ))
  const renderedPointCount = chart.data.datasets.reduce(
    (total, dataset) => total + dataset.data.length,
    0,
  )
  chart.destroy()
  chartHost.remove()
  return {
    pointCount,
    datasetCount,
    markerVariant,
    markerRadius: markerVariant === 'baseline'
      ? 'chart-default'
      : Number(markerVariant.replace('radius-', '')),
    renderedPointCount,
    initial: {
      createMs: round(initialCreateMs),
      animation: initialAnimation,
    },
    update: {
      invokeMs: round(updateInvokeMs),
      animation: updateAnimation,
    },
    heartbeat: heartbeatResult,
    longTasks: caseLongTasks,
  }
}

async function measureCase(pointCount, datasetCount, markerVariant, options) {
  for (let index = 0; index < options.warmup; index += 1) {
    await measureOne(pointCount, datasetCount, markerVariant, options)
  }
  const samples = []
  for (let index = 0; index < options.iterations; index += 1) {
    samples.push(await measureOne(pointCount, datasetCount, markerVariant, options))
  }
  return {
    pointCount,
    datasetCount,
    markerVariant,
    samples,
  }
}

async function runBenchmark() {
  const options = resolveOptions()
  statusElement.textContent = '現行Line chartの描画を測定しています...'
  await delay(0)
  const cases = []
  for (const pointCount of options.cases) {
    for (const datasetCount of options.datasetCounts) {
      for (const markerVariant of options.markerVariants) {
        cases.push(await measureCase(
          pointCount,
          datasetCount,
          markerVariant,
          options,
        ))
      }
    }
  }
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
  window.__r20ConservativeRenderingResult = result
  resultElement.textContent = JSON.stringify(result, null, 2)
  statusElement.textContent = pageErrors.length === 0
    ? 'Benchmark complete.'
    : 'Benchmark completed with diagnostics.'
}

runBenchmark().catch((error) => {
  const result = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    pageErrors: [
      ...pageErrors,
      { message: String(error?.stack ?? error), source: 'runner' },
    ],
  }
  window.__r20ConservativeRenderingError = result
  resultElement.textContent = JSON.stringify(result, null, 2)
  statusElement.textContent = 'Benchmark failed.'
})
