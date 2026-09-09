import os from 'node:os'
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

import {
  createInstrumentedRuntime,
} from './instrumented-runtime.js'
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
import { rankSyncHotspots } from './trace-dependencies.js'
import { createResultDigest } from './result-digest.js'

const BENCHMARK_NAME = 'r22-numerical-performance'
const RESULTS_DIRECTORY = fileURLToPath(new URL('./results/', import.meta.url))

export function parseArgs(argv = process.argv.slice(2)) {
  let json = false
  let help = false
  let iterations = undefined
  let warmupIterations = undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      json = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    const match = /^(--iterations|--warmup)(?:=(.*))?$/.exec(argument)
    if (!match) {
      throw new Error(`Unknown benchmark argument: ${argument}`)
    }
    const raw = match[2] ?? argv[++index]
    if (raw === undefined || !/^\d+$/.test(raw)) {
      throw new Error(`${match[1]} must be a non-negative integer`)
    }
    const value = Number(raw)
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${match[1]} must be a safe integer`)
    }
    if (match[1] === '--iterations') {
      iterations = value
    } else {
      warmupIterations = value
    }
  }
  return {
    json,
    help,
    ...validateMeasurementOptions({ iterations, warmupIterations }),
  }
}

function helpText() {
  return [
    `Usage: node experiments/r22-numerical-performance/node-benchmark.mjs [options]`,
    '',
    `--iterations N  warm samples per fixture (1..${100})`,
    `--warmup N      warmup samples per fixture (0..${20})`,
    '--json          write machine-readable JSON to stdout',
  ].join('\n')
}

async function loadProductionModules() {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  try {
    const [
      backtrack,
      d10,
      damage,
      damageAggregation,
      dx,
      fft,
      range,
      score,
      client,
      resourceGuard,
      distribution,
      runtimeDamageRoll,
    ] = await Promise.all([
      server.ssrLoadModule('/src/calculation/BacktrackCalculator.js'),
      server.ssrLoadModule('/src/calculation/D10Calculator.js'),
      server.ssrLoadModule('/src/calculation/DamageCalculator.js'),
      server.ssrLoadModule('/src/calculation/DamageAggregation.js'),
      server.ssrLoadModule('/src/calculation/DxCalculator.js'),
      server.ssrLoadModule('/src/core/probability/FFT.js'),
      server.ssrLoadModule('/src/calculation/RangePlanner.js'),
      server.ssrLoadModule('/src/calculation/ScoreCalculator.js'),
      server.ssrLoadModule('/src/runtime/CalculationClient.js'),
      server.ssrLoadModule('/src/runtime/ResourceGuard.js'),
      server.ssrLoadModule('/src/calculation/DistributionResult.js'),
      server.ssrLoadModule('/src/calculation/RuntimeDamageRollCalculator.js'),
    ])
    return {
      calculateD10Distribution: d10.calculateD10Distribution,
      createD10DistributionProvider: d10.createD10DistributionProvider,
      calculateDamageOnDemand: damage.calculateDamageOnDemand,
      getDamageStatistics: damage.getDamageStatistics,
      planDamageAggregation: damageAggregation.planDamageAggregation,
      sumDamage: damageAggregation.sumDamage,
      calculateDxDistribution: dx.calculateDxDistribution,
      calculateFinalEncroachment: backtrack.calculateFinalEncroachment,
      convolveDistributions: fft.convolveDistributions,
      planCalculationRanges: range.planCalculationRanges,
      calculateScore: score.calculateScore,
      getScoreStatistics: score.getScoreStatistics,
      getTotalDamageStatistics: distribution.getTotalDamageStatistics,
      createCalculationClient: client.createCalculationClient,
      createCalculationDependencies: client.createCalculationDependencies,
      createResourceGuard: resourceGuard.createResourceGuard,
      generateMixedDamageDistribution:
        runtimeDamageRoll.generateMixedDamageDistribution,
      server,
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

function timeNow() {
  return performance.now()
}

async function timedInvoke(operation) {
  const startedAt = timeNow()
  try {
    const result = await operation()
    return {
      result,
      elapsedMs: timeNow() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      result: null,
      elapsedMs: timeNow() - startedAt,
      error,
    }
  }
}

async function measureOneFixture({
  fixture,
  modules,
  context,
  mode,
  options,
  sharedRuntime,
}) {
  const plan = getFixturePlan(modules, fixture)
  if (plan !== null && plan.accepted === false) {
    return createFixtureReport(
      fixture,
      plan,
      null,
      null,
      {
        status: 'planner-rejected',
        errors: [],
        mainThread: null,
        longTasks: { supported: false, count: null, maxDurationMs: null },
        trace: [],
      }
    )
  }

  const traceRecords = []
  const errors = []
  let firstResult = null
  let firstDigest = null
  const warmSamples = []

  async function runSample() {
    const runtime = mode === 'steady-state'
      ? sharedRuntime
      : createInstrumentedRuntime(modules)
    runtime.tracer.clear()
    const sample = await timedInvoke(() => invokeFixture(runtime, fixture, context))
    traceRecords.push(...runtime.tracer.slice())
    if (mode !== 'steady-state') {
      // Node's direct DR provider has no disposable resource. The fresh
      // runtime and provider are intentionally discarded after each sample.
    }
    return sample
  }

  for (let index = 0; index < options.warmupIterations; index += 1) {
    const sample = await runSample()
    if (sample.error !== null) {
      errors.push(formatError(sample.error))
      break
    }
  }

  const firstMeasured = await runSample()
  if (firstMeasured.error !== null) {
    errors.push(formatError(firstMeasured.error))
  } else {
    firstResult = firstMeasured.result
    firstDigest = createResultDigest(firstResult)
    for (let index = 0; index < options.iterations; index += 1) {
      const sample = await runSample()
      if (sample.error !== null) {
        errors.push(formatError(sample.error))
        break
      }
      warmSamples.push(sample.elapsedMs)
      firstResult = sample.result
      firstDigest = createResultDigest(firstResult)
    }
  }

  return createFixtureReport(
    fixture,
    plan,
    {
      firstMeasuredMs: round(firstMeasured.elapsedMs),
      warm: summarizeSamples(warmSamples),
    },
    firstResult,
    {
      status: errors.length === 0 ? 'measured' : 'execution-error',
      mode: mode,
      errors,
      mainThread: null,
      longTasks: { supported: false, count: null, maxDurationMs: null },
      trace: traceRecords.length === 0
        ? []
        : (() => {
            const grouped = new Map()
            for (const record of traceRecords) {
              const key = `${record.name}:${record.kind}`
              const group = grouped.get(key) ?? {
                name: record.name,
                kind: record.kind,
                values: [],
                errors: 0,
              }
              group.values.push(record.elapsedMs)
              if (record.error !== null) {
                group.errors += 1
              }
              grouped.set(key, group)
            }
            return Array.from(grouped.values()).map((group) => ({
              name: group.name,
              kind: group.kind,
              ...summarizeSamples(group.values),
              errors: group.errors,
            })).sort((left, right) => right.totalMs - left.totalMs)
          })(),
      digest: firstDigest,
    }
  )
}

async function measureMode({ mode, options, modules, prepared }) {
  const sharedRuntime = mode === 'steady-state'
    ? createInstrumentedRuntime(modules)
    : null
  const context = {
    scorePair: prepared.scorePair,
  }
  const measurements = []
  const records = []
  try {
    for (const fixture of prepared.fixtures) {
      const measurement = await measureOneFixture({
        fixture,
        modules,
        context,
        mode,
        options,
        sharedRuntime,
      })
      measurements.push(measurement)
      for (const trace of measurement.trace ?? []) {
        // Reconstructing one representative record is enough for ranking;
        // the per-fixture trace remains the authoritative report.
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

async function verifyTraceParity(modules, prepared, referenceMeasurements) {
  const reference = new Map(
    referenceMeasurements.map((measurement) => [measurement.id, measurement.digest])
  )
  const runtime = createInstrumentedRuntime(modules)
  const parity = []
  try {
    for (const fixture of prepared.fixtures) {
      const plan = getFixturePlan(modules, fixture)
      if (plan?.accepted === false) {
        continue
      }
      const sample = await timedInvoke(() => invokeFixture(
        runtime,
        fixture,
        { scorePair: prepared.scorePair }
      ))
      const digest = sample.error === null
        ? createResultDigest(sample.result)
        : null
      parity.push({
        id: fixture.id,
        expectedDigest: reference.get(fixture.id) ?? null,
        observedDigest: digest,
        equal: digest !== null && digest === reference.get(fixture.id),
      })
    }
  } finally {
    runtime.tracer.clear()
  }
  return parity
}

function buildMetadata(options, stressSelection) {
  const cpu = os.cpus()[0]
  return {
    benchmark: BENCHMARK_NAME,
    schemaVersion: 1,
    startSha: process.env.R22_START_SHA ?? null,
    generatedAt: new Date().toISOString(),
    environment: {
      os: `${process.platform} ${os.release()}`,
      arch: process.arch,
      cpu: cpu?.model?.trim() ?? null,
      cpuCount: os.cpus().length,
      node: process.version,
      hardwareConcurrency: os.cpus().length,
      deviceMemory: null,
      cpuThrottle: null,
      timestamp: new Date().toISOString(),
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
      normalP95Ms: 16.7,
      cpu4xP95Ms: 50,
      longTaskMs: 50,
      repeatRuns: 3,
      repeatRequired: 2,
      nodeDiagnosticOnly: true,
    },
  }
}

export async function runBenchmark(options = {}) {
  const normalizedOptions = validateMeasurementOptions(options)
  const loaded = await loadProductionModules()
  const modules = loaded
  try {
    const setupRuntime = createInstrumentedRuntime(modules)
    const prepared = await prepareFixtures(setupRuntime, modules)
    setupRuntime.tracer.clear()
    // Attach a plan to ordinary DX fixtures so the measured working range is
    // the same range the production planner would select.
    prepared.fixtures = prepared.fixtures.map((fixture) => (
      fixture.operation === 'dx' && fixture.plan === undefined
        ? Object.freeze({
            ...fixture,
            plan: getFixturePlan(modules, fixture),
          })
        : fixture
    ))

    const steadyState = await measureMode({
      mode: 'steady-state',
      options: normalizedOptions,
      modules,
      prepared,
    })
    const cacheMiss = await measureMode({
      mode: 'cache-miss',
      options: normalizedOptions,
      modules,
      prepared,
    })
    const parity = await verifyTraceParity(
      modules,
      prepared,
      steadyState.measurements
    )
    const allMeasurements = [
      ...steadyState.measurements,
      ...cacheMiss.measurements,
    ]
    const potentialTriggers = evaluatePotentialTriggers(allMeasurements)
    const report = {
      ...buildMetadata(normalizedOptions, prepared.stressSelection),
      status: 'measured',
      mode: 'node-diagnostic',
      fixtures: prepared.fixtures.map((fixture) => ({
        id: fixture.id,
        operation: fixture.operation,
        label: fixture.label,
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
        potentialTriggers,
        repeatableTriggers: [],
        note: 'Node measurements localize hotspots only; browser evidence is required for production decisions.',
      },
      candidateRanking: rankSyncHotspots([
        ...steadyState.records,
        ...cacheMiss.records,
      ]),
      decision: 'pending-browser-evidence',
      resultDigest: createResultDigest({
        steadyState: steadyState.measurements.map(({ id, digest }) => ({ id, digest })),
        cacheMiss: cacheMiss.measurements.map(({ id, digest }) => ({ id, digest })),
      }),
    }
    await mkdir(RESULTS_DIRECTORY, { recursive: true })
    await writeFile(
      `${RESULTS_DIRECTORY}baseline-node.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    )
    return report
  } finally {
    await loaded.server?.close()
  }
}

function formatHumanReport(report) {
  const lines = [
    `R22 numerical performance (${report.mode})`,
    `Node ${report.environment.node} on ${report.environment.os}/${report.environment.arch}`,
    `decision=${report.decision} digest=${report.resultDigest}`,
  ]
  for (const modeName of ['steadyState', 'cacheMiss']) {
    lines.push(`[${modeName}]`)
    for (const measurement of report.modes[modeName]) {
      const timing = measurement.timing?.warm
      lines.push(
        `${measurement.id}: status=${measurement.status} `
        + `first=${measurement.timing?.firstMeasuredMs ?? '-'}ms `
        + `p95=${timing?.p95Ms ?? '-'}ms `
        + `digest=${measurement.digest ?? '-'} `
        + `errors=${measurement.errors.length}`
      )
    }
  }
  return lines.join('\n')
}

function isMainModule() {
  return process.argv[1] !== undefined
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
}

if (isMainModule()) {
  try {
    const args = parseArgs()
    if (args.help) {
      console.log(helpText())
    } else {
      const report = await runBenchmark(args)
      console.log(args.json ? JSON.stringify(report, null, 2) : formatHumanReport(report))
      if (report.status !== 'measured') {
        process.exitCode = 1
      }
    }
  } catch (error) {
    console.error(formatError(error))
    process.exitCode = 1
  }
}
