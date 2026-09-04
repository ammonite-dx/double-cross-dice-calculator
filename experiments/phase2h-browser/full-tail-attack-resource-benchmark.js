import { calculationClient } from '../../src/runtime/CalculationClient.js'
import { createAttackCanonicalRunner } from '../../src/features/attack/model/AttackCanonicalRunner.js'
import {
  createCanonicalAttackState,
  createCanonicalComboDataState,
} from '../../src/features/attack/model/AttackCanonicalState.js'
import {
  FULL_TAIL_ATTACK_BENCHMARK_POLICY,
  FULL_TAIL_ATTACK_CASES,
  FULL_TAIL_ATTACK_CASE_IDS,
} from './full-tail-attack-fixtures.js'

const REPORT_SCHEMA_VERSION = 1
const DEFAULT_ITERATIONS = 3
const DEFAULT_WARMUP_ITERATIONS = 1
const MAX_ITERATIONS = 100
const MAX_WARMUP_ITERATIONS = 100
const DATA_PATH_PATTERN = /\/data\/schema-v\d+\/revision-\d+\//

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const pageErrors = []
const unhandledRejections = []
const longTaskEntries = []
let resultSink = 0

const diagnostics = {
  fetch: {
    calls: [],
    installError: null,
  },
  worker: {
    createdCount: 0,
    postMessageCount: 0,
    messageCount: 0,
    errorCount: 0,
    messageErrorCount: 0,
    terminateCount: 0,
    transferCount: 0,
    transferBytes: 0,
    instances: [],
    errors: [],
    requests: [],
    pending: new Map(),
    installError: null,
  },
  fftLengths: [],
}

window.addEventListener('error', (event) => {
  pageErrors.push({
    type: 'pageerror',
    message: event.message,
    source: event.filename || null,
    line: event.lineno || null,
    column: event.colno || null,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  unhandledRejections.push({
    type: 'unhandledrejection',
    message: String(event.reason?.stack ?? event.reason),
  })
})

const supportedEntryTypes = typeof PerformanceObserver === 'undefined'
  ? []
  : PerformanceObserver.supportedEntryTypes ?? []
const longTaskSupported = supportedEntryTypes.includes('longtask')
let longTaskObserver = null
if (longTaskSupported) {
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
  } catch (error) {
    diagnostics.longTaskObserverError = formatError(error)
  }
}

function setStatus(message) {
  statusElement.textContent = message
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function round(value) {
  return Number(value.toFixed(3))
}

function clone(value) {
  return structuredClone(value)
}

function summarizeSamples(samples) {
  const values = samples
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right)
  if (values.length === 0) {
    return null
  }
  const percentile = (probability) => values[
    Math.min(values.length - 1, Math.ceil(probability * values.length) - 1)
  ]
  return {
    sampleCount: values.length,
    minMs: round(values[0]),
    medianMs: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(values.at(-1)),
  }
}

function parseBoundedInteger(rawValue, name, maximum, allowZero) {
  if (rawValue === null) {
    return null
  }
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer`)
  }
  const value = Number(rawValue)
  if (
    !Number.isSafeInteger(value)
    || (!allowZero && value === 0)
    || value > maximum
  ) {
    const range = allowZero ? `0..${maximum}` : `1..${maximum}`
    throw new Error(`${name} must be in ${range}`)
  }
  return value
}

function measurementOptions(testCase) {
  const query = new URLSearchParams(window.location.search)
  const queryIterations = parseBoundedInteger(
    query.get('iterations'),
    'iterations',
    MAX_ITERATIONS,
    false
  )
  const queryWarmup = parseBoundedInteger(
    query.get('warmup'),
    'warmup',
    MAX_WARMUP_ITERATIONS,
    true
  )
  return {
    iterations: queryIterations ?? testCase.iterations ?? DEFAULT_ITERATIONS,
    warmupIterations: queryWarmup
      ?? testCase.warmupIterations
      ?? DEFAULT_WARMUP_ITERATIONS,
    overridden: queryIterations !== null || queryWarmup !== null,
  }
}

function normalizeUrl(value) {
  try {
    const url = value instanceof Request ? value.url : String(value)
    return new URL(url, window.location.href)
  } catch {
    return null
  }
}

function dataPath(value) {
  const url = normalizeUrl(value)
  if (!url || !DATA_PATH_PATTERN.test(url.pathname)) {
    return null
  }
  return url.pathname.slice(1)
}

function installFetchDiagnostics() {
  const nativeFetch = globalThis.fetch
  if (typeof nativeFetch !== 'function') {
    diagnostics.fetch.installError = 'globalThis.fetch is unavailable'
    return
  }
  try {
    globalThis.fetch = async (...args) => {
      const record = {
        path: dataPath(args[0]),
        status: null,
        elapsedMs: null,
        error: null,
      }
      const started = performance.now()
      diagnostics.fetch.calls.push(record)
      try {
        const response = await nativeFetch.apply(globalThis, args)
        record.status = response.status
        return response
      } catch (error) {
        record.error = formatError(error)
        throw error
      } finally {
        record.elapsedMs = round(performance.now() - started)
      }
    }
  } catch (error) {
    diagnostics.fetch.installError = formatError(error)
  }
}

function transferByteLength(value) {
  if (value instanceof ArrayBuffer) {
    return value.byteLength
  }
  return ArrayBuffer.isView(value) ? value.byteLength : 0
}

function workerRequestKey(workerId, id) {
  return `${workerId}:${String(id)}`
}

function installWorkerDiagnostics() {
  const NativeWorker = globalThis.Worker
  if (typeof NativeWorker !== 'function') {
    diagnostics.worker.installError = 'globalThis.Worker is unavailable'
    return
  }
  try {
    globalThis.Worker = class InstrumentedWorker {
      constructor(...args) {
        this.nativeWorker = new NativeWorker(...args)
        this.instanceId = diagnostics.worker.createdCount
        diagnostics.worker.createdCount += 1
        diagnostics.worker.instances.push({
          id: this.instanceId,
          url: String(args[0] ?? ''),
          options: args[1] ?? null,
        })
      }

      addEventListener(type, listener, options) {
        const wrapped = (event) => {
          const id = event?.data?.id
          const request = diagnostics.worker.pending.get(
            workerRequestKey(this.instanceId, id)
          )
          if (type === 'message') {
            diagnostics.worker.messageCount += 1
            if (request) {
              request.responseElapsedMs = round(
                performance.now() - request.startedAt
              )
              request.responseStatus = event?.data?.error
                ? 'error'
                : 'success'
              request.error = event?.data?.error ?? null
              diagnostics.worker.pending.delete(
                workerRequestKey(this.instanceId, id)
              )
            }
          } else if (type === 'error' || type === 'messageerror') {
            if (type === 'error') {
              diagnostics.worker.errorCount += 1
            } else {
              diagnostics.worker.messageErrorCount += 1
            }
            diagnostics.worker.errors.push({
              type,
              message: event?.message ?? String(event),
            })
            if (request) {
              request.responseElapsedMs = round(
                performance.now() - request.startedAt
              )
              request.responseStatus = type
              request.error = event?.message ?? String(event)
              diagnostics.worker.pending.delete(
                workerRequestKey(this.instanceId, id)
              )
            }
          }
          listener(event)
        }
        return this.nativeWorker.addEventListener(type, wrapped, options)
      }

      postMessage(message, transfer = []) {
        diagnostics.worker.postMessageCount += 1
        if (Array.isArray(transfer)) {
          diagnostics.worker.transferCount += transfer.length
          diagnostics.worker.transferBytes += transfer.reduce(
            (total, value) => total + transferByteLength(value),
            0
          )
        }
        const request = {
          id: message?.id ?? null,
          workerId: this.instanceId,
          startedAt: performance.now(),
          responseElapsedMs: null,
          responseStatus: 'pending',
          error: null,
        }
        diagnostics.worker.requests.push(request)
        diagnostics.worker.pending.set(
          workerRequestKey(this.instanceId, request.id),
          request
        )
        return this.nativeWorker.postMessage(message, transfer)
      }

      terminate() {
        diagnostics.worker.terminateCount += 1
        return this.nativeWorker.terminate()
      }
    }
  } catch (error) {
    diagnostics.worker.installError = formatError(error)
  }
}

function snapshotCounters() {
  return {
    fetchCalls: diagnostics.fetch.calls.length,
    workerCreated: diagnostics.worker.createdCount,
    workerPostMessage: diagnostics.worker.postMessageCount,
    workerMessage: diagnostics.worker.messageCount,
    workerErrors: diagnostics.worker.errorCount,
    workerMessageErrors: diagnostics.worker.messageErrorCount,
    workerTerminated: diagnostics.worker.terminateCount,
    workerTransferCount: diagnostics.worker.transferCount,
    workerTransferBytes: diagnostics.worker.transferBytes,
    fftCallbackCount: diagnostics.fftLengths.length,
  }
}

function counterDelta(before, after) {
  return Object.fromEntries(
    Object.keys(after).map((key) => [key, after[key] - before[key]])
  )
}

function readMemorySnapshot() {
  const memory = performance.memory
  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
    return null
  }
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: Number.isFinite(memory.totalJSHeapSize)
      ? memory.totalJSHeapSize
      : null,
    jsHeapSizeLimit: Number.isFinite(memory.jsHeapSizeLimit)
      ? memory.jsHeapSizeLimit
      : null,
  }
}

async function invokeTimed(operation) {
  const timerStarted = performance.now()
  const timerPromise = new Promise((resolve) => {
    setTimeout(() => resolve(round(performance.now() - timerStarted)), 0)
  })
  const started = performance.now()
  try {
    const value = await operation()
    return {
      invocationElapsedMs: round(performance.now() - started),
      queuedZeroDelayTimerDelayMs: await timerPromise,
      value,
      error: null,
    }
  } catch (error) {
    return {
      invocationElapsedMs: round(performance.now() - started),
      queuedZeroDelayTimerDelayMs: await timerPromise,
      value: null,
      error,
    }
  }
}

async function runTimedSample(operation) {
  const beforeCounters = snapshotCounters()
  const beforeMemory = readMemorySnapshot()
  const longTaskStart = longTaskEntries.length
  const workerStart = diagnostics.worker.requests.length
  const timed = await invokeTimed(operation)
  const afterCounters = snapshotCounters()
  const afterMemory = readMemorySnapshot()
  const workerRequests = diagnostics.worker.requests.slice(workerStart)
  return {
    timed,
    counters: counterDelta(beforeCounters, afterCounters),
    memory: {
      before: beforeMemory,
      after: afterMemory,
      usedDeltaBytes: beforeMemory && afterMemory
        ? afterMemory.usedJSHeapSize - beforeMemory.usedJSHeapSize
        : null,
    },
    longTasks: longTaskSupported
      ? longTaskEntries.slice(longTaskStart)
      : null,
    workerRequests,
  }
}

async function measureStage({ name, iterations, warmupIterations, operation }) {
  const cold = await runTimedSample(operation)
  const warmup = []
  for (let index = 0; index < warmupIterations; index += 1) {
    warmup.push(await runTimedSample(operation))
  }
  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    samples.push(await runTimedSample(operation))
  }
  const allSamples = [cold, ...warmup, ...samples]
  const timedValues = (entries) => entries.map(
    (entry) => entry.timed.invocationElapsedMs
  )
  const errors = allSamples.filter((entry) => entry.timed.error !== null)
  const workerRequests = allSamples.flatMap((entry) => entry.workerRequests)
  const responseTimes = workerRequests
    .map((entry) => entry.responseElapsedMs)
    .filter((value) => Number.isFinite(value) && value >= 0)
  const memorySamples = allSamples.map((entry) => entry.memory)
  const longTasks = longTaskSupported
    ? allSamples.flatMap((entry) => entry.longTasks ?? [])
    : null
  const last = samples.at(-1) ?? warmup.at(-1) ?? cold
  const stage = {
    name,
    status: errors.length === 0 ? 'measured' : 'error',
    iterations,
    warmupIterations,
    cold: {
      invocationElapsedMs: summarizeSamples([cold.timed.invocationElapsedMs]),
      queuedZeroDelayTimerDelayMs: summarizeSamples([
        cold.timed.queuedZeroDelayTimerDelayMs,
      ]),
    },
    warm: {
      invocationElapsedMs: summarizeSamples(timedValues(samples)),
      queuedZeroDelayTimerDelayMs: summarizeSamples(
        samples.map((entry) => entry.timed.queuedZeroDelayTimerDelayMs)
      ),
    },
    worker: {
      requestCount: workerRequests.length,
      responseTimingMs: summarizeSamples(responseTimes),
      errors: workerRequests
        .filter((entry) => entry.error !== null)
        .map((entry) => ({
          id: entry.id,
          workerId: entry.workerId,
          error: entry.error,
        })),
    },
    memory: {
      supported: memorySamples.some((entry) => entry.before !== null),
      before: cold.memory.before,
      after: last.memory.after,
      samples: memorySamples,
      interpretation: 'performance.memory before/after usedJSHeapSize; this is not an exact peak allocation',
    },
    longTasks: {
      supported: longTaskSupported,
      count: longTaskSupported ? longTasks.length : null,
      entries: longTaskSupported ? longTasks : null,
    },
    lastOutcome: last.timed.value
      ?? (last.timed.error
        ? { status: 'error', error: serializeError(last.timed.error) }
        : null),
  }
  return stage
}

function serializeError(error) {
  if (!error) {
    return null
  }
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    rejectionReasons: Array.isArray(error.rejectionReasons)
      ? error.rejectionReasons
      : null,
  }
}

function rejectionReasons(plan) {
  if (Array.isArray(plan?.rejectionReasons)) {
    return plan.rejectionReasons.slice()
  }
  return (plan?.warnings ?? [])
    .filter((warning) => warning.severity === 'reject')
    .map((warning) => warning.code)
}

function summarizePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null
  }
  return {
    accepted: plan.accepted === true,
    status: plan.accepted === true ? 'accepted' : 'planner-rejected',
    operation: plan.operation ?? null,
    rejectionReasons: rejectionReasons(plan),
    warnings: Array.isArray(plan.warnings) ? clone(plan.warnings) : [],
    estimates: plan.estimates
      ? {
          timeMs: plan.estimates.timeMs ?? null,
          memoryBytes: plan.estimates.float64Bytes ?? null,
          operations: plan.estimates.operations ?? null,
        }
      : null,
    damage: plan.damage
      ? {
          maxDamageDice: plan.damage.maxDamageDice ?? null,
          rawSupportMax: plan.damage.rawSupportMax ?? null,
          workingMax: plan.damage.workingMax ?? null,
          workingLength: plan.damage.workingLength ?? null,
          fftLength: plan.damage.fftLength ?? null,
          defenceFftLength: plan.damage.defenceFftLength ?? null,
          scoreValueUpperBound: plan.damage.scoreValueUpperBound ?? null,
          kazanari: plan.damage.kazanari ?? null,
        }
      : null,
    scoreCutoff: Array.isArray(plan.scores)
      ? plan.scores.map((score) => score.tail?.cutoff ?? null)
      : null,
  }
}

function summarizeValues(values) {
  if (!values || typeof values.length !== 'number') {
    return null
  }
  let total = 0
  let digest = 0
  const stride = Math.max(1, Math.floor(values.length / 32))
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index])
    total += value
    if (index % stride === 0) {
      digest += value * (index + 1)
    }
  }
  return {
    length: values.length,
    total: round(total),
    digest: round(digest),
    first: values.length > 0 ? round(Number(values[0])) : null,
    last: values.length > 0 ? round(Number(values.at(-1))) : null,
  }
}

function summarizeEnvelope(envelope) {
  const result = envelope?.result
  const values = summarizeValues(result?.values)
  if (values) {
    resultSink = (resultSink + values.digest + values.total) % 1_000_000_007
  }
  return {
    offset: result?.offset ?? null,
    explicitLength: values?.length ?? null,
    support: result?.support ? clone(result.support) : null,
    overflow: result?.overflow ? clone(result.overflow) : null,
    values,
    metadata: envelope?.metadata ? clone(envelope.metadata) : null,
  }
}

function summarizeBatch(batchResult) {
  return {
    comboCount: Array.isArray(batchResult?.combos)
      ? batchResult.combos.length
      : null,
    total: summarizeEnvelope(batchResult?.canonicalTotalDamage),
    combos: Array.isArray(batchResult?.combos)
      ? batchResult.combos.map((combo) => ({
          id: combo.id,
          damage: summarizeEnvelope(combo.canonicalDamage),
        }))
      : [],
  }
}

async function measurePlan(testCase, policy, name, measurement) {
  const stage = await measureStage({
    name,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    operation: () => calculationClient.planAttackCombo(
      testCase.entries[0].params,
      policy
    ),
  })
  return {
    timing: {
      cold: stage.cold,
      warm: stage.warm,
    },
    plan: summarizePlan(stage.lastOutcome),
    stage,
  }
}

async function measureExecution(testCase, measurement) {
  const stage = await measureStage({
    name: 'CalculationClient.calculateAttackCanonicalBatch benchmark policy',
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    operation: async () => {
      const rangePlans = []
      const fftLengths = []
      const result = await calculationClient.calculateAttackCanonicalBatch(
        testCase.entries,
        {
          requestId: `phase2h-17-${testCase.id}`,
          rangePolicy: FULL_TAIL_ATTACK_BENCHMARK_POLICY,
          onRangePlan: (plan) => rangePlans.push(summarizePlan(plan)),
          onFftLength: (fftLength) => {
            diagnostics.fftLengths.push(fftLength)
            fftLengths.push(fftLength)
          },
        }
      )
      return { result, rangePlans, fftLengths }
    },
  })
  const outcome = stage.lastOutcome
  const result = outcome?.result
  return {
    status: stage.status === 'measured' ? 'measured' : 'error',
    error: stage.status === 'measured' ? null : outcome?.error ?? null,
    timing: {
      cold: stage.cold,
      warm: stage.warm,
    },
    worker: stage.worker,
    memory: stage.memory,
    longTasks: stage.longTasks,
    plan: outcome?.rangePlans?.[0] ?? null,
    fftLengths: outcome?.fftLengths ?? [],
    result: result ? summarizeBatch(result) : null,
  }
}

async function runCase(testCase) {
  const measurement = measurementOptions(testCase)
  setStatus(`case ${FULL_TAIL_ATTACK_CASES.indexOf(testCase) + 1}/${FULL_TAIL_ATTACK_CASES.length}: ${testCase.id}`)
  const production = await measurePlan(
    testCase,
    undefined,
    'CalculationClient.planAttackCombo default production policy',
    measurement
  )
  const benchmarkPlan = await measurePlan(
    testCase,
    FULL_TAIL_ATTACK_BENCHMARK_POLICY,
    'CalculationClient.planAttackCombo permissive benchmark policy',
    measurement
  )
  const targetMatches = benchmarkPlan.plan?.damage?.maxDamageDice
    === testCase.targetMaxDamageDice
  const execution = benchmarkPlan.plan?.accepted === true && targetMatches
    ? await measureExecution(testCase, measurement)
    : {
        status: 'not-run',
        reason: targetMatches
          ? 'benchmark planner rejected'
          : 'benchmark damage maxDamageDice did not match fixture target',
        timing: null,
        worker: null,
        memory: null,
        longTasks: {
          supported: longTaskSupported,
          count: longTaskSupported ? 0 : null,
          entries: longTaskSupported ? [] : null,
        },
        plan: null,
        fftLengths: [],
        result: null,
      }
  return {
    id: testCase.id,
    label: testCase.label,
    targetMaxDamageDice: testCase.targetMaxDamageDice,
    input: clone(testCase.entries),
    note: testCase.note,
    production: {
      accepted: production.plan?.accepted ?? null,
      status: production.plan?.status ?? 'error',
      rejectionReasons: production.plan?.rejectionReasons ?? [],
      estimate: production.plan?.estimates ?? null,
      damage: production.plan?.damage ?? null,
      timing: production.timing,
    },
    benchmark: {
      accepted: benchmarkPlan.plan?.accepted ?? null,
      status: benchmarkPlan.plan?.status ?? 'error',
      rejectionReasons: benchmarkPlan.plan?.rejectionReasons ?? [],
      estimate: benchmarkPlan.plan?.estimates ?? null,
      damage: benchmarkPlan.plan?.damage ?? null,
      timing: benchmarkPlan.timing,
      targetMatches,
    },
    execution,
    status: execution.status,
  }
}

function findCase(id) {
  const testCase = FULL_TAIL_ATTACK_CASES.find((entry) => entry.id === id)
  if (!testCase) {
    throw new Error(`full-tail benchmark fixture is missing: ${id}`)
  }
  return testCase
}

async function runCancelProbe() {
  const entry = clone(findCase('matrix-202d-kazanari0').entries[0])
  const controller = new AbortController()
  let abortSent = false
  const started = performance.now()
  let result = null
  let error = null
  try {
    result = await calculationClient.calculateAttackCanonicalBatch(
      [entry],
      {
        signal: controller.signal,
        rangePolicy: FULL_TAIL_ATTACK_BENCHMARK_POLICY,
        requestId: 'phase2h-17-cancel',
        onRangePlan: () => {
          abortSent = true
          controller.abort()
        },
      }
    )
  } catch (caught) {
    error = caught
  }
  return {
    status: abortSent && error?.name === 'AbortError' ? 'measured' : 'error',
    abortSent,
    result: result ? 'completed-before-abort' : null,
    error: serializeError(error),
    elapsedMs: round(performance.now() - started),
    interpretation: 'AbortSignal is fired synchronously from onRangePlan after preflight and before calculation work.',
  }
}

async function runStaleProbe() {
  const firstEntry = clone(findCase('matrix-202d-kazanari0').entries[0])
  const secondEntry = clone(findCase('matrix-400d-kazanari0').entries[0])
  const state = {
    ...createCanonicalAttackState(),
    canonicalOptIn: true,
    combos: [{
      id: 'full-tail-stale-probe',
      data: {
        params: clone(firstEntry.params),
        ...createCanonicalComboDataState(),
      },
    }],
  }
  const runnerErrors = []
  const runner = createAttackCanonicalRunner({
    state,
    calculationClient,
    onError: (error) => runnerErrors.push(serializeError(error)),
  })
  const first = runner.run({
    rangePolicy: FULL_TAIL_ATTACK_BENCHMARK_POLICY,
    requestId: 'phase2h-17-stale-first',
  })
  state.combos[0].data.params = clone(secondEntry.params)
  const second = runner.run({
    rangePolicy: FULL_TAIL_ATTACK_BENCHMARK_POLICY,
    requestId: 'phase2h-17-stale-second',
  })
  const [firstCommit, secondCommit] = await Promise.all([first, second])
  runner.dispose()
  return {
    status: runnerErrors.length === 0 && firstCommit === false && secondCommit === true
      ? 'measured'
      : 'error',
    firstCommit,
    secondCommit,
    runnerErrors,
    canonicalResultReady: state.combos[0].data.canonicalResultReady,
    interpretation: 'The first request is stale/aborted and only the second latest request may commit.',
  }
}

function createReport(cases, cancel, stale) {
  const productionRejected = cases.filter(
    (entry) => entry.production.status === 'planner-rejected'
  )
  const caseCounts = {
    total: cases.length,
    measured: cases.filter((entry) => entry.status === 'measured').length,
    executionError: cases.filter((entry) => entry.status === 'error').length,
    productionAccepted: cases.filter((entry) => entry.production.accepted === true).length,
    productionRejected: productionRejected.length,
    benchmarkAccepted: cases.filter((entry) => entry.benchmark.accepted === true).length,
  }
  const fetches = diagnostics.fetch.calls.filter((entry) => entry.path !== null)
  const status = caseCounts.executionError === 0
    && caseCounts.measured === caseCounts.total
    && cancel.status === 'measured'
    && stale.status === 'measured'
    ? 'measured'
    : 'error'
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    benchmark: 'full-tail-attack-browser-resource',
    status,
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    policies: {
      production: 'CalculationClient.planAttackCombo(params) default policy',
      benchmark: clone(FULL_TAIL_ATTACK_BENCHMARK_POLICY),
      benchmarkScope: 'RangePlanner thresholds and scorePropagation only; calculationMax/display/costModel and runtime absolute caps remain default',
    },
    caseIds: FULL_TAIL_ATTACK_CASE_IDS.slice(),
    caseCounts,
    cases,
    worker: {
      status: diagnostics.worker.createdCount > 0
        ? 'production-runtime-observed'
        : 'not-created',
      protocol: 'existing RuntimeDamageRollClient -> RuntimeDamageRollWorker',
      counters: snapshotCounters(),
      instances: diagnostics.worker.instances.slice(),
      requestTimings: diagnostics.worker.requests.map((request) => ({
        id: request.id,
        workerId: request.workerId,
        responseElapsedMs: request.responseElapsedMs,
        responseStatus: request.responseStatus,
        error: request.error,
      })),
      errors: diagnostics.worker.errors.slice(),
      installError: diagnostics.worker.installError,
    },
    assets: {
      fetchCallCount: fetches.length,
      fetches,
      resourceEntries: performance.getEntriesByType('resource')
        .map((entry) => ({
          path: dataPath(entry.name),
          initiatorType: entry.initiatorType,
          durationMs: round(entry.duration),
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
        }))
        .filter((entry) => entry.path !== null),
      d10Fetches: fetches.filter((entry) => /(?:^|\/)d10(?:\/|\.|$)/i.test(entry.path)),
    },
    diagnostics: {
      fetchInstallError: diagnostics.fetch.installError,
      fftCallbackCount: diagnostics.fftLengths.length,
      cancel,
      stale,
      longTasks: {
        supported: longTaskSupported,
        count: longTaskSupported ? longTaskEntries.length : null,
        entries: longTaskSupported ? longTaskEntries.slice() : null,
        observerError: diagnostics.longTaskObserverError ?? null,
      },
    },
    pageErrors,
    unhandledRejections,
    resultSink: round(resultSink),
    limitations: [
      'performance.memory is optional and before/after usedJSHeapSize is not an exact peak allocation.',
      'Long Task count/entries are null when PerformanceObserver longtask is unsupported; null is not zero.',
      'Worker errors are naturally observed; this benchmark does not crash a production Worker to create a synthetic error.',
      'Task 5 production threshold decision remains separate from this measurement.',
    ],
  }
}

function publishResult(report) {
  window.__phase2hFullTailAttackBrowserResourceResult = report
  delete window.__phase2hFullTailAttackBrowserResourceError
  resultElement.textContent = JSON.stringify(report, null, 2)
  setStatus('実測完了。結果globalを確認できます。')
}

function publishError(error) {
  const message = formatError(error)
  window.__phase2hFullTailAttackBrowserResourceError = message
  delete window.__phase2hFullTailAttackBrowserResourceResult
  resultElement.textContent = JSON.stringify({
    status: 'error',
    message,
    pageErrors,
    unhandledRejections,
  }, null, 2)
  setStatus(`実測に失敗しました: ${message}`)
}

async function runBenchmark() {
  installFetchDiagnostics()
  installWorkerDiagnostics()
  const cases = []
  for (const testCase of FULL_TAIL_ATTACK_CASES) {
    cases.push(await runCase(testCase))
  }
  setStatus('cancel/stale診断を実行しています...')
  const cancel = await runCancelProbe()
  const stale = await runStaleProbe()
  longTaskObserver?.disconnect()
  publishResult(createReport(cases, cancel, stale))
}

runBenchmark().catch(publishError)
