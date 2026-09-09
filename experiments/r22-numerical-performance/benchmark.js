import {
  calculateFinalEncroachment,
} from '../../src/calculation/BacktrackCalculator.js'
import {
  calculateD10Distribution,
  createD10DistributionProvider,
} from '../../src/calculation/D10Calculator.js'
import {
  calculateDamageOnDemand,
  getDamageStatistics,
} from '../../src/calculation/DamageCalculator.js'
import {
  planDamageAggregation,
  sumDamage,
} from '../../src/calculation/DamageAggregation.js'
import { calculateDxDistribution } from '../../src/calculation/DxCalculator.js'
import { convolveDistributions } from '../../src/core/probability/FFT.js'
import {
  planCalculationRanges,
} from '../../src/calculation/RangePlanner.js'
import {
  calculateScore,
  getScoreStatistics,
} from '../../src/calculation/ScoreCalculator.js'
import { getTotalDamageStatistics } from '../../src/calculation/DistributionResult.js'
import {
  createCalculationClient,
  createCalculationDependencies,
} from '../../src/runtime/CalculationClient.js'
import { createResourceGuard } from '../../src/runtime/ResourceGuard.js'
import { createRuntimeDamageRollClient } from '../../src/runtime/RuntimeDamageRollClient.js'
import { generateMixedDamageDistribution } from '../../src/calculation/RuntimeDamageRollCalculator.js'

import { createInstrumentedRuntime } from './instrumented-runtime.js'
import {
  createFixtureReport,
  evaluatePotentialTriggers,
  formatError,
  getFixturePlan,
  invokeFixture,
  prepareFixtures,
  round,
  summarizeSamples,
  validateMeasurementOptions,
} from './measurement.js'
import { createResultDigest, estimateValueBytes } from './result-digest.js'
import { rankSyncHotspots } from './trace-dependencies.js'

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const FRAME_BUDGET_MS = 16.7

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message
  }
}

function readMeasurementOptions() {
  const query = new URLSearchParams(window.location.search)
  const iterations = query.get('iterations')
  const warmupIterations = query.get('warmup')
  return validateMeasurementOptions({
    iterations: iterations === null ? undefined : Number(iterations),
    warmupIterations: warmupIterations === null
      ? undefined
      : Number(warmupIterations),
  })
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
  if (!supportedEntryTypes.includes('longtask')) {
    return { supported: false, entries: [] }
  }
  const entries = []
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push({
          durationMs: round(entry.duration),
          startTimeMs: round(entry.startTime),
        })
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
    return { supported: true, entries, observer }
  } catch {
    return { supported: false, entries: [] }
  }
}

function flushLongTasks(observerState) {
  if (!observerState.supported) {
    return Promise.resolve()
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
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

function createModules() {
  return {
    calculateD10Distribution,
    createD10DistributionProvider,
    calculateDamageOnDemand,
    getDamageStatistics,
    planDamageAggregation,
    sumDamage,
    calculateDxDistribution,
    calculateFinalEncroachment,
    convolveDistributions,
    planCalculationRanges,
    calculateScore,
    getScoreStatistics,
    getTotalDamageStatistics,
    createCalculationClient,
    createCalculationDependencies,
    createResourceGuard,
    generateMixedDamageDistribution,
  }
}

function summarizeTrace(records) {
  const groups = new Map()
  for (const record of records) {
    const key = `${record.name}:${record.kind}`
    const group = groups.get(key) ?? {
      name: record.name,
      kind: record.kind,
      values: [],
      errors: 0,
    }
    group.values.push(record.elapsedMs)
    if (record.error !== null) {
      group.errors += 1
    }
    groups.set(key, group)
  }
  return Array.from(groups.values())
    .map((group) => ({
      name: group.name,
      kind: group.kind,
      ...summarizeSamples(group.values),
      errors: group.errors,
    }))
    .sort((left, right) => right.totalMs - left.totalMs)
}

function collectSyncSpan(records) {
  const syncValues = records
    .filter((record) => record.kind === 'sync' && record.error === null)
    .map((record) => record.elapsedMs)
  return syncValues.length === 0 ? null : Math.max(...syncValues)
}

async function timedInvoke(operation) {
  const startedAt = performance.now()
  try {
    return {
      result: await operation(),
      elapsedMs: performance.now() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      result: null,
      elapsedMs: performance.now() - startedAt,
      error,
    }
  }
}

async function measureFixture({
  fixture,
  modules,
  prepared,
  mode,
  options,
  sharedRuntime,
  workerClient,
  heartbeat,
  observerState,
}) {
  const plan = getFixturePlan(modules, fixture)
  if (plan !== null && plan.accepted === false) {
    return createFixtureReport(fixture, plan, null, null, {
      status: 'planner-rejected',
      mode,
      errors: [],
      mainThread: null,
      longTasks: {
        supported: observerState.supported,
        count: null,
        maxDurationMs: null,
        entries: [],
      },
      workerWait: null,
      trace: [],
    })
  }

  await flushLongTasks(observerState)
  const heartbeatMark = heartbeat.mark()
  const longTaskMark = observerState.entries.length
  const memoryBefore = readMemory()
  const measured = []
  const syncSpans = []
  const traceRecords = []
  const errors = []

  async function runSample() {
    if (mode === 'cache-miss') {
      // Eviction is deliberately outside the timed operation. The Worker is
      // prewarmed once per page, so startup latency remains a separate metric.
      workerClient.clearCache()
    }
    const runtime = mode === 'steady-state'
      ? sharedRuntime
      : createInstrumentedRuntime(modules, {
          runtimeDamageRollClient: workerClient,
        })
    runtime.tracer.clear()
    const sample = await timedInvoke(() => invokeFixture(
      runtime,
      fixture,
      { scorePair: prepared.scorePair }
    ))
    const records = runtime.tracer.slice()
    return { sample, records }
  }

  for (let index = 0; index < options.warmupIterations; index += 1) {
    const { sample } = await runSample()
    if (sample.error !== null) {
      errors.push(formatError(sample.error))
      break
    }
  }

  const first = await runSample()
  let result = null
  if (first.sample.error !== null) {
    errors.push(formatError(first.sample.error))
  } else {
    result = first.sample.result
    measured.push(first.sample.elapsedMs)
    if (collectSyncSpan(first.records) !== null) {
      syncSpans.push(collectSyncSpan(first.records))
    }
    traceRecords.push(...first.records)
    for (let index = 0; index < options.iterations; index += 1) {
      const { sample, records } = await runSample()
      if (sample.error !== null) {
        errors.push(formatError(sample.error))
        break
      }
      measured.push(sample.elapsedMs)
      syncSpans.push(collectSyncSpan(records) ?? 0)
      traceRecords.push(...records)
      result = sample.result
    }
  }

  await flushLongTasks(observerState)
  const memoryAfter = readMemory()
  const taskEntries = observerState.entries.slice(longTaskMark)
  const workerWaitValues = traceRecords
    .filter((record) => record.name === 'getDamageRollDistribution'
      && record.kind === 'async'
      && record.error === null)
    .map((record) => record.elapsedMs)
  return createFixtureReport(
    fixture,
    plan,
    {
      firstMeasuredMs: first.sample.error === null
        ? round(first.sample.elapsedMs)
        : null,
      warm: summarizeSamples(measured),
    },
    result,
    {
      status: errors.length === 0 ? 'measured' : 'execution-error',
      mode,
      errors,
      mainThread: {
        synchronous: summarizeSamples(syncSpans),
        heartbeat: heartbeat.summarize(heartbeatMark),
        memoryBefore,
        memoryAfter,
      },
      longTasks: {
        supported: observerState.supported,
        count: taskEntries.length,
        maxDurationMs: taskEntries.length === 0
          ? null
          : Math.max(...taskEntries.map(({ durationMs }) => durationMs)),
        entries: taskEntries,
      },
      workerWait: summarizeSamples(workerWaitValues),
      trace: summarizeTrace(traceRecords),
      outputBytes: result === null ? null : estimateValueBytes(result),
    }
  )
}

async function measureMode({
  mode,
  options,
  modules,
  prepared,
  workerClient,
  heartbeat,
  observerState,
}) {
  const sharedRuntime = mode === 'steady-state'
    ? createInstrumentedRuntime(modules, {
        runtimeDamageRollClient: workerClient,
      })
    : null
  const measurements = []
  const records = []
  try {
    for (const fixture of prepared.fixtures) {
      setStatus(`Measuring ${mode}: ${fixture.id}`)
      const measurement = await measureFixture({
        fixture,
        modules,
        prepared,
        mode,
        options,
        sharedRuntime,
        workerClient,
        heartbeat,
        observerState,
      })
      measurements.push(measurement)
      for (const trace of measurement.trace ?? []) {
        records.push({
          name: trace.name,
          kind: trace.kind,
          elapsedMs: trace.totalMs / Math.max(1, trace.sampleCount),
          error: trace.errors > 0 ? 'trace-error' : null,
        })
      }
    }
  } finally {
    sharedRuntime?.tracer.clear()
  }
  return { measurements, records }
}

async function warmWorker(workerClient) {
  const startedAt = performance.now()
  await workerClient.calculate(
    new Float64Array([1]),
    0,
    { fftLength: 2, distributionLength: 2, rawSupportMax: 0 }
  )
  return round(performance.now() - startedAt)
}

function buildMetadata(options, stressSelection, workerStartupMs) {
  return {
    benchmark: 'r22-numerical-performance',
    schemaVersion: 1,
    startSha: window.__r22StartSha ?? null,
    generatedAt: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null,
      longTaskSupported: null,
      cpuThrottle: window.__r22CpuThrottle ?? null,
      frameBudgetMs: FRAME_BUDGET_MS,
      workerStartupMs,
    },
    options,
    stressSelection: {
      shihai: stressSelection.shihai.attempts.map(({ params, accepted, error }) => ({
        params,
        accepted,
        error,
      })),
      yousei: stressSelection.yousei.attempts.map(({ params, accepted, error }) => ({
        params,
        accepted,
        error,
      })),
    },
    criteria: {
      normalP95Ms: FRAME_BUDGET_MS,
      cpu4xP95Ms: 50,
      longTaskMs: 50,
      repeatRuns: 3,
      repeatRequired: 2,
      nodeDiagnosticOnly: false,
    },
  }
}

async function runBenchmark() {
  const options = readMeasurementOptions()
  const modules = createModules()
  const workerClient = createRuntimeDamageRollClient()
  const heartbeat = createHeartbeat()
  const observerState = installLongTaskObserver()
  heartbeat.start()
  try {
    const workerStartupMs = await warmWorker(workerClient)
    const setupRuntime = createInstrumentedRuntime(modules, {
      runtimeDamageRollClient: workerClient,
    })
    const prepared = await prepareFixtures(setupRuntime, modules)
    setupRuntime.tracer.clear()
    prepared.fixtures = prepared.fixtures.map((fixture) => (
      fixture.operation === 'dx' && fixture.plan === undefined
        ? Object.freeze({
            ...fixture,
            plan: getFixturePlan(modules, fixture),
          })
        : fixture
    ))
    workerClient.clearCache()

    const steadyState = await measureMode({
      mode: 'steady-state',
      options,
      modules,
      prepared,
      workerClient,
      heartbeat,
      observerState,
    })
    const cacheMiss = await measureMode({
      mode: 'cache-miss',
      options,
      modules,
      prepared,
      workerClient,
      heartbeat,
      observerState,
    })
    const parity = prepared.fixtures.map((fixture) => {
      const steady = steadyState.measurements.find(({ id }) => id === fixture.id)
      const cache = cacheMiss.measurements.find(({ id }) => id === fixture.id)
      return {
        id: fixture.id,
        steadyDigest: steady?.digest ?? null,
        cacheMissDigest: cache?.digest ?? null,
        equal: steady?.digest !== null
          && steady?.digest !== undefined
          && steady?.digest === cache?.digest,
      }
    })
    const allMeasurements = [
      ...steadyState.measurements,
      ...cacheMiss.measurements,
    ]
    const syncP95ThresholdMs = window.__r22CpuThrottle === 4
      ? 50
      : FRAME_BUDGET_MS
    const report = {
      ...buildMetadata(options, prepared.stressSelection, workerStartupMs),
      status: 'measured',
      mode: 'browser',
      fixtures: prepared.fixtures.map(({ id, operation, label }) => ({
        id,
        operation,
        label,
      })),
      modes: {
        steadyState: steadyState.measurements,
        cacheMiss: cacheMiss.measurements,
      },
      plannerEstimateComparison: prepared.fixtures.map((fixture) => {
        const plan = getFixturePlan(modules, fixture)
        const warm = steadyState.measurements.find(({ id }) => id === fixture.id)
        return {
          id: fixture.id,
          accepted: plan?.accepted ?? true,
          estimatedTimeMs: plan?.estimates?.timeMs ?? null,
          actualFirstMeasuredMs: warm?.timing?.firstMeasuredMs ?? null,
          actualSteadyP95Ms: warm?.timing?.warm?.p95Ms ?? null,
        }
      }),
      traceParity: parity,
      triggerEvaluation: {
        potentialTriggers: evaluatePotentialTriggers(allMeasurements, {
          syncP95ThresholdMs,
        }),
        repeatableTriggers: [],
        note: 'Repeatability is evaluated by the Playwright runner across three full browser runs.',
      },
      candidateRanking: rankSyncHotspots([
        ...steadyState.records,
        ...cacheMiss.records,
      ]),
      decision: 'pending-repeatability',
      resultDigest: createResultDigest({
        steadyState: steadyState.measurements.map(({ id, digest }) => ({ id, digest })),
        cacheMiss: cacheMiss.measurements.map(({ id, digest }) => ({ id, digest })),
      }),
    }
    report.environment.longTaskSupported = observerState.supported
    observerState.observer?.disconnect()
    workerClient.dispose()
    window.__r22NumericalPerformanceResult = report
    window.__r22NumericalPerformanceError = null
    resultElement.textContent = JSON.stringify(report, null, 2)
    setStatus('Benchmark measured')
  } finally {
    heartbeat.stop()
    observerState.observer?.disconnect()
    workerClient.dispose()
  }
}

runBenchmark().catch((error) => {
  const message = formatError(error)
  window.__r22NumericalPerformanceResult = null
  window.__r22NumericalPerformanceError = message
  if (resultElement) {
    resultElement.textContent = message
  }
  setStatus('Benchmark error')
})
