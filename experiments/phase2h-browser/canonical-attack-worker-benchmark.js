import {
  calculationClient,
} from '../../src/runtime/CalculationClient.js'
import { createAttackRunner } from '../../src/features/attack/model/AttackRunner.js'
import {
  createAttackState,
  createComboDataState,
} from '../../src/features/attack/model/AttackState.js'
import {
  BENCHMARK_CASES,
  BENCHMARK_CASE_IDS,
} from './canonical-attack-fixtures.js'

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

function percentile(sortedValues, probability) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(probability * sortedValues.length) - 1
  )
  return sortedValues[index]
}

function summarizeSamples(samples) {
  const values = samples.map((sample) => sample)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right)
  if (values.length === 0) {
    return null
  }
  return {
    sampleCount: values.length,
    minMs: round(values[0]),
    medianMs: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
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

function resolveMeasurementOptions(testCase) {
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
    warmupIterations:
      queryWarmup ?? testCase.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS,
    overridden: queryIterations !== null || queryWarmup !== null,
  }
}

function normalizeUrl(value) {
  try {
    const url = value instanceof Request
      ? value.url
      : String(value)
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
      const started = performance.now()
      const record = {
        path: dataPath(args[0]),
        status: null,
        elapsedMs: null,
        error: null,
      }
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
  if (ArrayBuffer.isView(value)) {
    return value.byteLength
  }
  return 0
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
          if (type === 'message') {
            diagnostics.worker.messageCount += 1
          } else if (type === 'error') {
            diagnostics.worker.errorCount += 1
            diagnostics.worker.errors.push({
              type,
              message: event?.message ?? String(event),
            })
          } else if (type === 'messageerror') {
            diagnostics.worker.messageErrorCount += 1
            diagnostics.worker.errors.push({
              type,
              message: event?.message ?? String(event),
            })
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

function summarizePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null
  }
  return {
    accepted: plan.accepted ?? null,
    operation: plan.operation ?? null,
    warnings: Array.isArray(plan.warnings) ? clone(plan.warnings) : [],
    rejectionReasons: Array.isArray(plan.rejectionReasons)
      ? plan.rejectionReasons.slice()
      : [],
    estimates: plan.estimates ? clone(plan.estimates) : null,
    overflowInfo: plan.overflowInfo ? clone(plan.overflowInfo) : null,
    damage: plan.damage
      ? {
          fftLength: plan.damage.fftLength ?? null,
          workingLength: plan.damage.workingLength ?? null,
          rawSupportMax: plan.damage.rawSupportMax ?? null,
        }
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
    last: values.length > 0 ? round(Number(values[values.length - 1])) : null,
  }
}

function summarizeCanonicalDamage(envelope) {
  const result = envelope?.result
  if (!result || typeof result !== 'object') {
    return null
  }
  const values = summarizeValues(result.values)
  if (values) {
    resultSink = (resultSink + values.digest + values.total) % 1_000_000_007
  }
  return {
    version: result.version ?? null,
    offset: result.offset ?? null,
    explicitMax: values && values.length > 0
      ? (result.offset ?? 0) + values.length - 1
      : null,
    values,
    support: result.support ? clone(result.support) : null,
    overflow: result.overflow ? clone(result.overflow) : null,
    metadata: envelope.metadata ? clone(envelope.metadata) : null,
  }
}

function summarizeBatch(batchResult) {
  if (!batchResult || typeof batchResult !== 'object') {
    return null
  }
  return {
    comboCount: Array.isArray(batchResult.combos)
      ? batchResult.combos.length
      : null,
    comboIds: Array.isArray(batchResult.combos)
      ? batchResult.combos.map((combo) => combo.id)
      : [],
    combos: Array.isArray(batchResult.combos)
      ? batchResult.combos.map((combo) => ({
          id: combo.id,
          score: combo.scoreSummary ? clone(combo.scoreSummary) : null,
          canonicalDamage: summarizeCanonicalDamage(combo.damage),
          canonicalDamageSummary: combo.damageSummary
            ? clone(combo.damageSummary)
            : null,
        }))
      : [],
    canonicalTotalDamage: summarizeCanonicalDamage(
      batchResult.totalDamage
    ),
    canonicalTotalDamageSummary: batchResult.totalDamageSummary
      ? clone(batchResult.totalDamageSummary)
      : null,
  }
}

function summarizeResourceEntries() {
  return performance.getEntriesByType('resource')
    .map((entry) => ({
      path: dataPath(entry.name),
      initiatorType: entry.initiatorType,
      durationMs: round(entry.duration),
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
    }))
    .filter((entry) => entry.path !== null)
}

function fixtureInput(testCase) {
  return testCase.entries.map((entry) => ({
    id: entry.id,
    params: clone(entry.params),
  }))
}

function rangePlanOptions(testCase, requestId, onRangePlan, onFftLength) {
  return {
    requestId,
    rangePolicy: clone(testCase.plannerPolicy ?? {}),
    onRangePlan,
    onFftLength,
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

function sampleReport(timed, before, after) {
  return {
    invocationElapsedMs: timed.invocationElapsedMs,
    queuedZeroDelayTimerDelayMs: timed.queuedZeroDelayTimerDelayMs,
    diagnostics: counterDelta(before, after),
    value: timed.value,
    error: serializeError(timed.error),
  }
}

async function measureSamples({
  name,
  iterations,
  warmupIterations,
  operation,
}) {
  const coldBefore = snapshotCounters()
  const coldTimed = await invokeTimed(operation)
  const coldAfter = snapshotCounters()
  const cold = sampleReport(coldTimed, coldBefore, coldAfter)

  const warmup = []
  for (let index = 0; index < warmupIterations; index += 1) {
    const before = snapshotCounters()
    const timed = await invokeTimed(operation)
    const after = snapshotCounters()
    warmup.push(sampleReport(timed, before, after))
  }

  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    const before = snapshotCounters()
    const timed = await invokeTimed(operation)
    const after = snapshotCounters()
    samples.push(sampleReport(timed, before, after))
  }

  const last = samples.at(-1) ?? warmup.at(-1) ?? cold
  const errors = [cold, ...warmup, ...samples]
    .filter((sample) => sample.error !== null)
  const report = {
    name,
    status: errors.length === 0 ? 'measured' : 'error',
    iterations,
    warmupIterations,
    cold: {
      invocationElapsedMs: summarizeSamples([cold.invocationElapsedMs]),
      queuedZeroDelayTimerDelayMs: summarizeSamples([
        cold.queuedZeroDelayTimerDelayMs,
      ]),
    },
    warm: {
      invocationElapsedMs: summarizeSamples(
        samples.map((sample) => sample.invocationElapsedMs)
      ),
      queuedZeroDelayTimerDelayMs: summarizeSamples(
        samples.map((sample) => sample.queuedZeroDelayTimerDelayMs)
      ),
    },
    samples: samples.map(({ value, error, ...sample }) => ({
      ...sample,
      outcome: value ?? (error ? { status: 'error', error } : null),
    })),
    warmupDiagnostics: warmup.map(({ value, error, ...sample }) => ({
      ...sample,
      outcome: value ?? (error ? { status: 'error', error } : null),
    })),
    lastOutcome: last?.value
      ?? (last?.error ? { status: 'error', error: last.error } : null),
  }
  return report
}

async function runBatchSample(testCase, requestId) {
  const rangePlans = []
  const fftLengths = []
  const options = rangePlanOptions(
    testCase,
    requestId,
    (plan) => rangePlans.push(summarizePlan(plan)),
    (fftLength) => diagnostics.fftLengths.push(fftLength) && fftLengths.push(fftLength)
  )
  try {
    const result = await calculationClient.calculateAttackBatch(
      testCase.entries,
      options
    )
    return {
      status: 'success',
      result: summarizeBatch(result),
      rangePlans,
      fftLengths,
    }
  } catch (error) {
    return {
      status: 'error',
      error: serializeError(error),
      rangePlans,
      fftLengths,
    }
  }
}

async function runPlanSample(testCase, requestId) {
  try {
    const plan = calculationClient.planAttackCombo(
      testCase.entries[0].params,
      clone(testCase.plannerPolicy ?? {})
    )
    return {
      status: 'success',
      requestId,
      plan: summarizePlan(plan),
    }
  } catch (error) {
    return {
      status: 'error',
      requestId,
      error: serializeError(error),
    }
  }
}

function createCaseReport(testCase, measurement, stage, extra = {}) {
  return {
    id: testCase.id,
    label: testCase.label,
    tier: testCase.tier,
    execution: testCase.execution,
    executionReason: testCase.executionReason,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    iterationOverride: measurement.overridden,
    input: fixtureInput(testCase),
    note: testCase.note,
    stage,
    ...extra,
  }
}

async function runCase(testCase) {
  const measurement = resolveMeasurementOptions(testCase)
  const requestPrefix = `phase2h-14-${testCase.id}`

  if (testCase.execution === 'planner-only') {
    const stage = await measureSamples({
      name: 'CalculationClient.planAttackCombo',
      iterations: measurement.iterations,
      warmupIterations: measurement.warmupIterations,
      operation: () => runPlanSample(testCase, requestPrefix),
    })
    const lastPlan = stage.lastOutcome?.plan ?? null
    const plannerSucceeded = stage.lastOutcome?.status === 'success'
    return createCaseReport(testCase, measurement, stage, {
      status: stage.status === 'measured' && plannerSucceeded
        ? 'planner-only'
        : 'error',
      publicBoundary: 'calculationClient.planAttackCombo',
      plan: lastPlan,
      worker: 'not-called',
    })
  }

  const stage = await measureSamples({
    name: 'CalculationClient.calculateAttackBatch',
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    operation: () => runBatchSample(testCase, requestPrefix),
  })
  const lastOutcome = stage.lastOutcome
  const expectedReject = testCase.execution === 'public-rejected'
  const gotExpectedReject = expectedReject
    && lastOutcome?.status === 'error'
    && lastOutcome.error?.name === 'CalculationRangeError'
  const gotSuccess = !expectedReject && lastOutcome?.status === 'success'
  const caseStatus = stage.status !== 'measured'
    ? 'error'
    : gotExpectedReject
      ? 'planner-rejected'
      : gotSuccess
        ? 'measured'
        : 'error'
  return createCaseReport(testCase, measurement, stage, {
    status: caseStatus,
    publicBoundary: 'calculationClient.calculateAttackBatch',
    expectedReject,
    plan: lastOutcome?.rangePlans ?? null,
    worker: expectedReject && gotExpectedReject ? 'not-called' : 'diagnosed',
  })
}

function findCase(id) {
  const testCase = BENCHMARK_CASES.find((entry) => entry.id === id)
  if (!testCase) {
    throw new Error(`benchmark fixture is missing: ${id}`)
  }
  return testCase
}

async function runCancelProbe() {
  const source = findCase('kazanari-3').entries[0]
  const entry = {
    id: 'cancel-probe',
    params: clone(source.params),
  }
  entry.params.action.score.dice += 1
  const controller = new AbortController()
  let abortSent = false
  const before = snapshotCounters()
  const timed = await invokeTimed(async () => {
    const rangePlans = []
    try {
      const result = await calculationClient.calculateAttackBatch(
        [entry],
        {
          signal: controller.signal,
          requestId: 'phase2h-15-cancel',
          onRangePlan: (plan) => {
            rangePlans.push(summarizePlan(plan))
            abortSent = true
            controller.abort()
          },
        }
      )
      return {
        status: 'completed-before-abort',
        result: summarizeBatch(result),
        rangePlans,
      }
    } catch (error) {
      return {
        status: error.name === 'AbortError' ? 'aborted' : 'error',
        error: serializeError(error),
        rangePlans,
      }
    }
  })
  await new Promise((resolve) => setTimeout(resolve, 25))
  const after = snapshotCounters()
  return {
    status: timed.error ? 'error' : 'measured',
    abortBoundary: 'onRangePlan-preflight',
    abortSent,
    result: timed.value,
    error: serializeError(timed.error),
    invocationElapsedMs: timed.invocationElapsedMs,
    queuedZeroDelayTimerDelayMs: timed.queuedZeroDelayTimerDelayMs,
    diagnostics: counterDelta(before, after),
    interpretation: 'AbortSignal is aborted synchronously from CalculationClient.onRangePlan after preflight and before Worker execution.',
  }
}

async function runStaleProbe() {
  const source = findCase('small-normal-kazanari-0').entries[0]
  const changed = findCase('fixed-shift-defence').entries[0]
  const state = {
    ...createAttackState(),
    combos: [{
      id: 'stale-probe',
      data: {
        params: clone(source.params),
        ...createComboDataState(),
      },
    }],
  }
  const runnerErrors = []
  const runner = createAttackRunner({
    state,
    calculationClient,
    onError: (error) => runnerErrors.push(serializeError(error)),
  })
  const before = snapshotCounters()
  const first = runner.run({ requestId: 'phase2h-14-stale-first' })
  state.combos[0].data.params = clone(changed.params)
  const second = runner.run({ requestId: 'phase2h-14-stale-second' })
  const [firstResult, secondResult] = await Promise.all([first, second])
  await new Promise((resolve) => setTimeout(resolve, 25))
  const after = snapshotCounters()
  return {
    status: runnerErrors.length === 0 ? 'measured' : 'error',
    firstCommit: firstResult,
    secondCommit: secondResult,
    canonicalResultReady: state.combos[0].data.resultReady,
    runnerErrors,
    diagnostics: counterDelta(before, after),
    interpretation: 'first latest-runner request is expected to be stale/aborted; second request is the only commit candidate',
  }
}

function createReport(cases, cancelProbe, staleProbe) {
  const caseCounts = {
    total: cases.length,
    measured: cases.filter((entry) => entry.status === 'measured').length,
    plannerOnly: cases.filter((entry) => entry.status === 'planner-only').length,
    plannerRejected: cases.filter(
      (entry) => entry.status === 'planner-rejected'
    ).length,
    error: cases.filter((entry) => entry.status === 'error').length,
  }
  const resourceEntries = summarizeResourceEntries()
  const fetchCalls = diagnostics.fetch.calls.filter((entry) => entry.path !== null)
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    status: caseCounts.error === 0 ? 'measured' : 'error',
    caseCounts,
    caseIds: BENCHMARK_CASE_IDS.slice(),
    cases,
    worker: {
      status: diagnostics.worker.createdCount > 0
        ? 'production-runtime-observed'
        : 'not-created',
      protocol: 'existing RuntimeDamageRollClient -> RuntimeDamageRollWorker',
      counters: snapshotCounters(),
      instances: diagnostics.worker.instances.slice(),
      errors: diagnostics.worker.errors.slice(),
      installError: diagnostics.worker.installError,
    },
    assets: {
      fetchCallCount: fetchCalls.length,
      fetches: fetchCalls.map((entry) => ({ ...entry })),
      resourceEntries,
      dataPathCounts: fetchCalls.reduce((counts, entry) => {
        counts[entry.path] = (counts[entry.path] ?? 0) + 1
        return counts
      }, {}),
    },
    diagnostics: {
      fetchInstallError: diagnostics.fetch.installError,
      fftCallbackCount: diagnostics.fftLengths.length,
      cancel: cancelProbe,
      stale: staleProbe,
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
      'Worker error counters record naturally observed native error/messageerror events; this page does not crash a production Worker to create a synthetic error.',
      'calculateAttackBatch has no stale commit policy by itself; stale behavior is measured through the existing AttackRunner.',
      'Attack.vue uses this benchmark as an explicit diagnostic page and is not a production UI path.',
    ],
  }
}

function publishResult(report) {
  window.__phase2hCanonicalAttackWorkerBenchmarkResult = report
  delete window.__phase2hCanonicalAttackWorkerBenchmarkError
  resultElement.textContent = JSON.stringify(report, null, 2)
  setStatus(
    '実測完了。window.__phase2hCanonicalAttackWorkerBenchmarkResult を確認できます。'
  )
}

function publishError(error) {
  const message = formatError(error)
  window.__phase2hCanonicalAttackWorkerBenchmarkError = message
  delete window.__phase2hCanonicalAttackWorkerBenchmarkResult
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
  for (const testCase of BENCHMARK_CASES) {
    setStatus(`case ${cases.length + 1}/${BENCHMARK_CASES.length}: ${testCase.id}`)
    cases.push(await runCase(testCase))
  }
  setStatus('cancel/stale診断を実行しています...')
  const cancelProbe = await runCancelProbe()
  const staleProbe = await runStaleProbe()
  longTaskObserver?.disconnect()
  publishResult(createReport(cases, cancelProbe, staleProbe))
}

runBenchmark().catch(publishError)
