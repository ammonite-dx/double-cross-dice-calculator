import { calculationClient } from '../../src/runtime/CalculationClient.js'
import {
  createWorkerCalculationClient,
} from './worker-client.js'
import {
  R19_FIXTURES,
  SUPERSESSION_FIXTURE,
} from './fixtures.js'
import {
  createResultDigest,
  estimateValueBytes,
} from './result-digest.js'

const REPORT_SCHEMA_VERSION = 1
const DEFAULT_ITERATIONS = 3
const DEFAULT_WARMUP_ITERATIONS = 1
const MAX_ITERATIONS = 20
const MAX_WARMUP_ITERATIONS = 10
const FRAME_BUDGET_MS = 16.7

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const longTaskEntries = []
let longTaskObserver = null

function flushLongTaskObserver() {
  if (longTaskObserver === null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function round(value) {
  return Number(value.toFixed(3))
}

function parseCount(raw, fallback, maximum, allowZero = false) {
  if (raw === null || raw === undefined || raw === '') {
    return fallback
  }
  if (!/^\d+$/.test(raw)) {
    throw new TypeError('benchmark counts must be integers')
  }
  const value = Number(raw)
  if (
    !Number.isSafeInteger(value)
    || value > maximum
    || (!allowZero && value === 0)
  ) {
    throw new RangeError(
      `benchmark count must be ${allowZero ? '0' : '1'}..${maximum}`
    )
  }
  return value
}

function getMeasurementOptions() {
  const query = new URLSearchParams(window.location.search)
  return {
    iterations: parseCount(
      query.get('iterations'),
      DEFAULT_ITERATIONS,
      MAX_ITERATIONS
    ),
    warmupIterations: parseCount(
      query.get('warmup'),
      DEFAULT_WARMUP_ITERATIONS,
      MAX_WARMUP_ITERATIONS,
      true
    ),
  }
}

function createHeartbeat() {
  let timer = null
  let expected = null
  const delays = []

  function tick() {
    const now = performance.now()
    if (expected !== null) {
      delays.push(Math.max(0, now - expected))
    }
    expected = now + FRAME_BUDGET_MS
    timer = setTimeout(tick, FRAME_BUDGET_MS)
  }

  return {
    start() {
      if (timer === null) {
        expected = performance.now() + FRAME_BUDGET_MS
        timer = setTimeout(tick, FRAME_BUDGET_MS)
      }
    },
    stop() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
    mark() {
      return delays.length
    },
    summarize(fromIndex) {
      const samples = delays.slice(fromIndex)
      return {
        sampleCount: samples.length,
        maxDelayMs: samples.length === 0
          ? null
          : round(Math.max(...samples)),
        overFrameBudgetCount: samples.filter(
          (delay) => delay > FRAME_BUDGET_MS
        ).length,
      }
    },
  }
}

function installLongTaskObserver() {
  const supportedEntryTypes = typeof PerformanceObserver === 'undefined'
    ? []
    : PerformanceObserver.supportedEntryTypes ?? []
  const supported = supportedEntryTypes.includes('longtask')
  if (!supported) {
    return false
  }
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskEntries.push({
          durationMs: round(entry.duration),
          startTimeMs: round(entry.startTime),
        })
      }
    })
    longTaskObserver.observe({ type: 'longtask', buffered: true })
    return true
  } catch {
    return false
  }
}

function summarizeSamples(samples) {
  const sorted = samples.filter(
    (value) => Number.isFinite(value) && value >= 0
  ).sort((left, right) => left - right)
  if (sorted.length === 0) {
    return null
  }
  const percentile = (probability) => sorted[
    Math.min(
      sorted.length - 1,
      Math.ceil(probability * sorted.length) - 1
    )
  ]
  return {
    sampleCount: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1)),
  }
}

function readMemory() {
  const memory = performance.memory
  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
    return null
  }
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  }
}

function callMain(client, fixture, options = {}) {
  switch (fixture.operation) {
    case 'check':
      return client.calculateCheck(
        fixture.params,
        fixture.difficulty,
        options
      )
    case 'attack':
      return client.calculateAttack(fixture.params, options)
    case 'totalDamage':
      return client.calculateTotalDamage(fixture.damages, options)
    case 'backtrack':
      return client.calculateBacktrack(fixture.params, options)
    default:
      throw new TypeError(`Unknown fixture operation: ${fixture.operation}`)
  }
}

function workerArgs(fixture) {
  switch (fixture.operation) {
    case 'check':
      return {
        params: fixture.params,
        difficulty: fixture.difficulty,
      }
    case 'attack':
      return { params: fixture.params }
    case 'totalDamage':
      return { damages: fixture.damages }
    case 'backtrack':
      return { params: fixture.params }
    default:
      throw new TypeError(`Unknown fixture operation: ${fixture.operation}`)
  }
}

function callWorker(client, fixture, options = {}) {
  return client.calculate(
    fixture.operation,
    workerArgs(fixture),
    options
  )
}

function unwrapResult(topology, response) {
  return topology === 'generalized-worker'
    ? response.result
    : response
}

async function timedCall(topology, call) {
  const startedAt = performance.now()
  try {
    const response = await call()
    return {
      response,
      result: unwrapResult(topology, response),
      elapsedMs: performance.now() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      response: null,
      result: null,
      elapsedMs: performance.now() - startedAt,
      error: formatError(error),
    }
  }
}

function getTransport(topology, response) {
  return topology === 'generalized-worker'
    ? response?.transport ?? null
    : null
}

async function measureFixture({
  topology,
  client,
  fixture,
  iterations,
  warmupIterations,
  heartbeat,
}) {
  const call = (options = {}) => topology === 'generalized-worker'
    ? callWorker(client, fixture, options)
    : callMain(client, fixture, options)
  // PerformanceObserver delivery is asynchronous. Drain any entries from the
  // previous fixture before taking the per-fixture mark.
  await flushLongTaskObserver()
  const input = fixture.operation === 'totalDamage'
    ? fixture.damages
    : fixture.params ?? { params: fixture.params, difficulty: fixture.difficulty }
  const inputBytes = estimateValueBytes(input)
  const heartbeatMark = heartbeat.mark()
  const longTaskMark = longTaskEntries.length
  const warmupErrors = []
  const roundTripSamples = []
  const messageOverheadSamples = []

  const recordTransport = (response) => {
    const transport = getTransport(topology, response)
    if (transport === null) {
      return
    }
    if (Number.isFinite(transport.roundTripMs)) {
      roundTripSamples.push(transport.roundTripMs)
    }
    if (
      Number.isFinite(transport.roundTripMs)
      && Number.isFinite(transport.workerTiming?.computeMs)
    ) {
      messageOverheadSamples.push(
        Math.max(0, transport.roundTripMs - transport.workerTiming.computeMs)
      )
    }
  }

  for (let index = 0; index < warmupIterations; index += 1) {
    const sample = await timedCall(topology, call)
    if (sample.error !== null) {
      warmupErrors.push(sample.error)
      break
    }
  }

  const memoryBefore = readMemory()
  const cold = await timedCall(topology, call)
  const warmSamples = []
  const workerSamples = []
  const errors = [...warmupErrors]
  if (cold.error !== null) {
    errors.push(cold.error)
  }
  if (cold.error === null) {
    const coldTransport = getTransport(topology, cold.response)
    recordTransport(cold.response)
    if (coldTransport?.workerTiming?.computeMs !== undefined) {
      workerSamples.push(coldTransport.workerTiming.computeMs)
    }
    for (let index = 0; index < iterations; index += 1) {
      const sample = await timedCall(topology, call)
      if (sample.error !== null) {
        errors.push(sample.error)
        break
      }
      warmSamples.push(sample.elapsedMs)
      const transport = getTransport(topology, sample.response)
      recordTransport(sample.response)
      if (transport?.workerTiming?.computeMs !== undefined) {
        workerSamples.push(transport.workerTiming.computeMs)
      }
    }
  }

  await flushLongTaskObserver()
  const memoryAfter = readMemory()
  const mainThread = heartbeat.summarize(heartbeatMark)
  const taskEntries = longTaskEntries.slice(longTaskMark)
  const result = cold.result
  return {
    id: fixture.id,
    label: fixture.label,
    operation: fixture.operation,
    topology,
    cold: {
      elapsedMs: round(cold.elapsedMs),
      status: cold.error === null ? 'success' : 'error',
    },
    warm: summarizeSamples(warmSamples),
    workerCompute: summarizeSamples(workerSamples),
    transport: topology === 'generalized-worker'
      ? {
          roundTrip: summarizeSamples(roundTripSamples),
          messageOverhead: summarizeSamples(messageOverheadSamples),
        }
      : null,
    mainThread,
    longTasks: {
      count: taskEntries.length,
      maxDurationMs: taskEntries.length === 0
        ? null
        : round(Math.max(...taskEntries.map(({ durationMs }) => durationMs))),
    },
    inputBytes,
    outputBytes: result === null ? null : estimateValueBytes(result),
    digest: result === null ? null : createResultDigest(result),
    memory: {
      before: memoryBefore,
      after: memoryAfter,
    },
    errors,
  }
}

async function measureWorkerStartup(client) {
  const startedAt = performance.now()
  try {
    const ready = await client.waitUntilReady()
    return {
      status: 'ready',
      elapsedMs: round(performance.now() - startedAt),
      workerReportedStartupMs: ready.workerTiming?.startupMs === undefined
        ? null
        : round(ready.workerTiming.startupMs),
    }
  } catch (error) {
    return {
      status: 'error',
      elapsedMs: round(performance.now() - startedAt),
      workerReportedStartupMs: null,
      error: formatError(error),
    }
  }
}

async function measureCandidate({
  topology,
  client,
  fixtures,
  options,
  heartbeat,
}) {
  heartbeat.start()
  const measurements = []
  for (const fixture of fixtures) {
    measurements.push(await measureFixture({
      topology,
      client,
      fixture,
      iterations: options.iterations,
      warmupIterations: options.warmupIterations,
      heartbeat,
    }))
  }
  heartbeat.stop()
  return measurements
}

function attachUnderlyingObserver(topology, startedState) {
  return (settlement) => {
    if (topology === 'hybrid') {
      if (settlement && typeof settlement.then === 'function') {
        Promise.resolve(settlement).then(
          () => { startedState.underlyingSettledAt = performance.now() },
          () => { startedState.underlyingSettledAt = performance.now() }
        )
      }
      return
    }
    startedState.underlyingSettledAt = performance.now()
  }
}

async function measureSupersession({ topology, client, fixture, heartbeat }) {
  await flushLongTaskObserver()
  const heartbeatMark = heartbeat.mark()
  const longTaskMark = longTaskEntries.length
  const state = {
    underlyingSettledAt: null,
    callerSettledAt: null,
  }
  const controller = new AbortController()
  const call = (options = {}) => topology === 'generalized-worker'
    ? callWorker(client, fixture, options)
    : callMain(client, fixture, options)
  const startedAt = performance.now()
  const stalePromise = call({
    signal: controller.signal,
    onUnderlyingSettled: attachUnderlyingObserver(topology, state),
  }).then(
    (response) => {
      state.callerSettledAt = performance.now()
      return { response, result: unwrapResult(topology, response), error: null }
    },
    (error) => {
      state.callerSettledAt = performance.now()
      return { response: null, result: null, error: formatError(error) }
    }
  )

  await Promise.resolve()
  const abortAt = performance.now()
  controller.abort()
  const latestStartedAt = performance.now()
  const latest = await timedCall(topology, () => call())
  const stale = await stalePromise
  await flushLongTaskObserver()
  const latestTransport = getTransport(topology, latest.response)
  const latestComputeMs = latestTransport?.workerTiming?.computeMs ?? null
  const taskEntries = longTaskEntries.slice(longTaskMark)
  const elapsedMs = performance.now() - startedAt

  return {
    topology,
    staleOperation: fixture.id,
    latestOperation: fixture.id,
    staleStatus: stale.error === null ? 'fulfilled-before-abort' : 'caller-aborted',
    callerAbortMs: state.callerSettledAt === null
      ? null
      : round(state.callerSettledAt - abortAt),
    latestQueueDelayMs: latestComputeMs === null
      ? null
      : round(Math.max(0, latest.elapsedMs - latestComputeMs)),
    latestTotalLatencyMs: round(latest.elapsedMs),
    latestFromAbortMs: round(performance.now() - abortAt),
    underlyingStaleCompletionMs: state.underlyingSettledAt === null
      ? null
      : round(state.underlyingSettledAt - abortAt),
    staleCallerError: stale.error,
    latestError: latest.error,
    latestDigest: latest.result === null
      ? null
      : createResultDigest(latest.result),
    mainThread: heartbeat.summarize(heartbeatMark),
    longTasks: {
      count: taskEntries.length,
      maxDurationMs: taskEntries.length === 0
        ? null
        : round(Math.max(...taskEntries.map(({ durationMs }) => durationMs))),
    },
    latestStartedAfterAbortMs: round(latestStartedAt - abortAt),
    sequenceElapsedMs: round(elapsedMs),
  }
}

function compareMeasurements(hybrid, generalized) {
  const byId = new Map(generalized.map((measurement) => [measurement.id, measurement]))
  return hybrid.map((measurement) => {
    const candidate = byId.get(measurement.id)
    return {
      id: measurement.id,
      hybridDigest: measurement.digest,
      generalizedWorkerDigest: candidate?.digest ?? null,
      equal: measurement.digest !== null
        && measurement.digest === candidate?.digest,
    }
  })
}

function setStatus(message) {
  statusElement.textContent = message
}

async function runBenchmark() {
  const options = getMeasurementOptions()
  const heartbeat = createHeartbeat()
  const longTaskSupported = installLongTaskObserver()
  const hybridMeasurements = await measureCandidate({
    topology: 'hybrid',
    client: calculationClient,
    fixtures: R19_FIXTURES,
    options,
    heartbeat,
  })

  setStatus('Measuring generalized Worker…')
  const generalizedClient = createWorkerCalculationClient()
  const generalizedWorkerStartup = await measureWorkerStartup(generalizedClient)
  const generalizedMeasurements = await measureCandidate({
    topology: 'generalized-worker',
    client: generalizedClient,
    fixtures: R19_FIXTURES,
    options,
    heartbeat,
  })

  setStatus('Measuring rapid supersession…')
  heartbeat.start()
  const supersession = [
    await measureSupersession({
      topology: 'hybrid',
      client: calculationClient,
      fixture: SUPERSESSION_FIXTURE,
      heartbeat,
    }),
    await measureSupersession({
      topology: 'generalized-worker',
      client: generalizedClient,
      fixture: SUPERSESSION_FIXTURE,
      heartbeat,
    }),
  ]
  heartbeat.stop()
  generalizedClient.dispose()
  longTaskObserver?.disconnect()

  const parity = compareMeasurements(
    hybridMeasurements,
    generalizedMeasurements
  )
  const allErrors = [
    ...hybridMeasurements,
    ...generalizedMeasurements,
  ].flatMap((measurement) => measurement.errors)
  const latestErrors = supersession.flatMap(({
    staleCallerError,
    staleStatus,
    latestError,
  }) => [
    // Abort is the expected caller-visible result for the deliberately
    // superseded request. Only an unexpected stale settlement is an error.
    staleStatus === 'caller-aborted' ? null : staleCallerError,
    latestError,
  ]).filter((error) => error !== null)
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    status: allErrors.length === 0 && latestErrors.length === 0 && parity.every(
      ({ equal }) => equal
    ) ? 'passed' : 'error',
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      longTaskSupported,
      frameBudgetMs: FRAME_BUDGET_MS,
    },
    options,
    candidates: [
      { id: 'hybrid', description: 'main thread calculation + RuntimeDamageRollWorker' },
      { id: 'generalized-worker', description: 'one persistent Worker for all four operations' },
    ],
    measurements: {
      hybrid: hybridMeasurements,
      generalizedWorker: generalizedMeasurements,
    },
    workerStartup: {
      hybrid: {
        status: 'not-measured',
        note: 'Current hybrid owns a separate production RuntimeDamageRollWorker; R19 does not instrument its constructor.'
      },
      generalizedWorker: generalizedWorkerStartup,
    },
    parity,
    supersession,
  }
  window.__r19WorkerArchitectureResult = report
  window.__r19WorkerArchitectureError = null
  resultElement.textContent = JSON.stringify(report, null, 2)
  setStatus(`Benchmark ${report.status}`)
}

runBenchmark().catch((error) => {
  const message = formatError(error)
  window.__r19WorkerArchitectureResult = null
  window.__r19WorkerArchitectureError = message
  resultElement.textContent = message
  setStatus('Benchmark error')
})
