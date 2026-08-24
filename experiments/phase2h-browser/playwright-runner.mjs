import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

import { chromium, firefox, webkit } from 'playwright'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/phase2h-browser/browser-benchmark.html'
const CANONICAL_ATTACK_BENCHMARK_PATH =
  '/experiments/phase2h-browser/canonical-attack-worker-benchmark.html'
const FULL_TAIL_ATTACK_BENCHMARK_PATH =
  '/experiments/phase2h-browser/full-tail-attack-resource-benchmark.html'
const EXPECTED_NODE_VERSION = (
  await readFile(new URL('../../.node-version', import.meta.url), 'utf8')
).trim()
const PLAYWRIGHT_VERSION = JSON.parse(
  await readFile(
    new URL('../../node_modules/playwright/package.json', import.meta.url),
    'utf8',
  )
).version
const DEFAULT_TIMEOUT_MILLISECONDS = 10 * 60 * 1000
const VITE_START_TIMEOUT_MILLISECONDS = 30 * 1000
const MAX_ITERATIONS = 100
const MAX_WARMUP_ITERATIONS = 100
const EXPECTED_CASE_IDS = [
  'small-normal-kazanari-0',
  'fixed-shift-defence',
  'kazanari-3',
  'failure-mass',
  'combo-total-3',
  'range-warning-boundary',
  'range-reject-boundary',
]
const EXPECTED_FULL_TAIL_ATTACK_CASE_IDS = [
  'matrix-202d-kazanari0',
  'matrix-202d-kazanari1',
  'matrix-202d-kazanari9',
  'matrix-400d-kazanari0',
  'matrix-400d-kazanari1',
  'matrix-400d-kazanari9',
  'matrix-600d-kazanari0',
  'matrix-600d-kazanari1',
  'matrix-600d-kazanari9',
  'stress-yousei9',
  'stress-shihai19',
]

const TARGET_CONFIGS = {
  core: {
    id: 'core',
    benchmarkPath: BENCHMARK_PATH,
    resultGlobal: '__phase2hBrowserBenchmarkResult',
    errorGlobal: '__phase2hBrowserBenchmarkError',
    benchmarkName: 'phase2h-browser-playwright',
  },
  'canonical-attack': {
    id: 'canonical-attack',
    benchmarkPath: CANONICAL_ATTACK_BENCHMARK_PATH,
    resultGlobal: '__phase2hCanonicalAttackWorkerBenchmarkResult',
    errorGlobal: '__phase2hCanonicalAttackWorkerBenchmarkError',
    benchmarkName: 'phase2h-browser-playwright-canonical-attack',
  },
  'full-tail-attack-resource': {
    id: 'full-tail-attack-resource',
    benchmarkPath: FULL_TAIL_ATTACK_BENCHMARK_PATH,
    resultGlobal: '__phase2hFullTailAttackBrowserResourceResult',
    errorGlobal: '__phase2hFullTailAttackBrowserResourceError',
    benchmarkName: 'phase2h-browser-playwright-full-tail-attack-resource',
    chromeOnly: true,
    omittedEngines: [
      {
        id: 'firefox',
        status: 'omitted',
        reason: 'dedicated Task 6 target measures Chrome desktop and CPU 4x only; use the existing canonical-attack target for cross-engine comparison',
      },
      {
        id: 'webkit',
        status: 'omitted',
        reason: 'dedicated Task 6 target measures Chrome desktop and CPU 4x only; use the existing canonical-attack target for cross-engine comparison',
      },
    ],
  },
}

function getTargetConfig(targetId) {
  const target = TARGET_CONFIGS[targetId]
  if (!target) {
    throw new Error(
      `--target must be one of: ${Object.keys(TARGET_CONFIGS).join(', ')}`
    )
  }
  return target
}

const BASE_ENGINE_CONFIGS = [
  {
    id: 'firefox',
    label: 'Playwright Firefox',
    browserType: firefox,
    launchOptions: { headless: true },
    cpuThrottlingRate: null,
  },
  {
    id: 'webkit',
    label: 'Playwright WebKit',
    browserType: webkit,
    launchOptions: { headless: true },
    cpuThrottlingRate: null,
  },
  {
    id: 'chrome-cpu-4x',
    label: "Playwright Chrome channel 'chrome' with CDP CPU throttling 4x",
    browserType: chromium,
    launchOptions: {
      channel: 'chrome',
      headless: true,
    },
    cpuThrottlingRate: 4,
  },
]

const OPTIONAL_ENGINE_CONFIG = {
  id: 'chrome',
  label: "Playwright Chrome channel 'chrome' without CPU throttling",
  browserType: chromium,
  launchOptions: {
    channel: 'chrome',
    headless: true,
  },
  cpuThrottlingRate: null,
}

function getEngineConfigs(options, target) {
  if (target.chromeOnly) {
    return [
      BASE_ENGINE_CONFIGS.find((engine) => engine.id === 'chrome-cpu-4x'),
      OPTIONAL_ENGINE_CONFIG,
    ]
  }
  return options.includeChrome
    ? [...BASE_ENGINE_CONFIGS, OPTIONAL_ENGINE_CONFIG]
    : BASE_ENGINE_CONFIGS
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function parseBoundedInteger(rawValue, name, maximum, allowZero) {
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

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    target: 'core',
    iterations: null,
    warmup: null,
    includeChrome: false,
    help: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--include-chrome') {
      options.includeChrome = true
      continue
    }

    const targetMatch = /^(--target)(?:=(.*))?$/.exec(argument)
    if (targetMatch) {
      const targetId = targetMatch[2] ?? args[++index]
      if (targetId === undefined) {
        throw new Error('--target requires a value')
      }
      options.target = targetId
      getTargetConfig(options.target)
      continue
    }

    const match = /^(--iterations|--warmup)(?:=(.*))?$/.exec(argument)
    if (!match) {
      throw new Error(`unknown argument: ${argument}`)
    }
    const name = match[1] === '--iterations' ? 'iterations' : 'warmup'
    const rawValue = match[2] ?? args[++index]
    if (rawValue === undefined) {
      throw new Error(`${match[1]} requires a value`)
    }
    options[name] = parseBoundedInteger(
      rawValue,
      match[1],
      name === 'iterations' ? MAX_ITERATIONS : MAX_WARMUP_ITERATIONS,
      name === 'warmup',
    )
  }

  return options
}

function helpText() {
  return [
    'Usage: node experiments/phase2h-browser/playwright-runner.mjs [options]',
    '',
    'Options:',
    '  --target NAME    Measure core or canonical-attack (default: core)',
    `  --iterations N  Override warm samples (1..${MAX_ITERATIONS})`,
    `  --warmup N      Override warmup samples (0..${MAX_WARMUP_ITERATIONS})`,
    "  --include-chrome  Include an unthrottled Chrome channel comparison",
    '  --help          Show this message',
  ].join('\n')
}

function getNodeEnvironment() {
  const nodeDirectory = dirname(process.execPath)
  const inheritedPath = process.env.Path ?? process.env.PATH ?? ''
  const path = `${nodeDirectory};${inheritedPath}`
  return {
    ...process.env,
    Path: path,
    PATH: path,
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null
        ? address.port
        : null
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        if (!port) {
          reject(new Error('failed to obtain a free local port'))
          return
        }
        resolve(port)
      })
    })
  })
}

function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => child.once('exit', resolve))
}

async function startViteServer(target) {
  const port = await getFreePort()
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      VITE_CONFIG,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      env: getNodeEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  let stderr = ''
  let spawnError = null
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.on('error', (error) => {
    spawnError = error
  })
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const url = `http://127.0.0.1:${port}${target.benchmarkPath}`
  try {
    const started = Date.now()
    let lastError = null
    while (Date.now() - started < VITE_START_TIMEOUT_MILLISECONDS) {
      if (spawnError) {
        throw spawnError
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error([
          `Vite exited before becoming ready (code=${child.exitCode}, signal=${child.signalCode})`,
          stderr.trim(),
          stdout.trim(),
        ].filter(Boolean).join('\n'))
      }
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(1000),
        })
        if (response.ok) {
          return { child, port, url, stdout, stderr }
        }
        lastError = new Error(`Vite returned HTTP ${response.status}`)
      } catch (error) {
        lastError = error
      }
      await delay(100)
    }

    throw new Error([
      `Vite did not become ready within ${VITE_START_TIMEOUT_MILLISECONDS} ms`,
      formatError(lastError),
      stderr.trim(),
      stdout.trim(),
    ].filter(Boolean).join('\n'))
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await Promise.race([waitForChildExit(child), delay(5000)])
    }
    throw error
  }
}

async function stopViteServer(server) {
  if (!server) {
    return { stopped: true, error: null }
  }
  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill()
    await Promise.race([waitForChildExit(server.child), delay(5000)])
  }
  const stopped = server.child.exitCode !== null || server.child.signalCode !== null
  return {
    stopped,
    error: stopped ? null : 'Vite child process did not exit within 5000 ms',
  }
}

function buildBenchmarkUrl(baseUrl, options, target) {
  const params = new URLSearchParams()
  if (options.iterations !== null) {
    params.set('iterations', String(options.iterations))
  }
  if (options.warmup !== null) {
    params.set('warmup', String(options.warmup))
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return `${baseUrl}${target.benchmarkPath}${suffix}`
}

function validateReport(
  report,
  capturedPageErrors = [],
  target = TARGET_CONFIGS.core,
) {
  if (target.id === 'canonical-attack') {
    return validateCanonicalAttackReport(report, capturedPageErrors)
  }
  if (target.id === 'full-tail-attack-resource') {
    return validateFullTailAttackReport(report, capturedPageErrors)
  }

  const counts = report?.caseCounts ?? {}
  const cases = Array.isArray(report?.cases) ? report.cases : []
  const actualIds = cases.map((entry) => entry?.id)
  const expectedIds = EXPECTED_CASE_IDS.slice().sort()
  const sortedActualIds = actualIds.slice().sort()
  const stageErrors = cases.flatMap((entry) => (
    (entry?.stages ?? [])
      .filter((stage) => stage?.status === 'error')
      .map((stage) => `${entry.id}:${stage.name}`)
  ))
  const numericDigestValidation = validateNumericDigests(report)
  const checks = {
    reportStatus: report?.status === 'measured',
    caseCounts: counts.total === EXPECTED_CASE_IDS.length
      && counts.measured === 5
      && counts.plannerOnly === 1
      && counts.plannerRejected === 1
      && counts.error === 0,
    caseIds: JSON.stringify(sortedActualIds) === JSON.stringify(expectedIds),
    stageErrors: stageErrors.length === 0,
    numericDigests: numericDigestValidation.valid,
    assetSetup: report?.assetSetup?.status === 'measured',
    resultSink: Number.isFinite(report?.resultSink),
    pageErrors: capturedPageErrors.length === 0
      && (report?.pageErrors?.length ?? 0) === 0
      && (report?.unhandledRejections?.length ?? 0) === 0,
  }
  return {
    valid: Object.values(checks).every(Boolean),
    checks,
    stageErrors,
    numericDigestValidation,
    reportedCaseCounts: counts,
  }
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0
}

function validateFullTailAttackReport(report, capturedPageErrors) {
  const cases = Array.isArray(report?.cases) ? report.cases : []
  const actualIds = cases.map((entry) => entry?.id).sort()
  const expectedIds = EXPECTED_FULL_TAIL_ATTACK_CASE_IDS.slice().sort()
  const matrixCases = cases.filter((entry) => entry?.id?.startsWith('matrix-'))
  const stressCases = cases.filter((entry) => entry?.id?.startsWith('stress-'))
  const engines = report?.engines ?? []
  const chrome = engines.find((entry) => entry.id === 'chrome')
  const chromeCpu = engines.find((entry) => entry.id === 'chrome-cpu-4x')
  const d10Fetches = report?.assets?.d10Fetches ?? []
  const longTasks = report?.diagnostics?.longTasks
  const caseShape = cases.every((entry) => (
    entry?.production?.timing
    && entry?.benchmark?.timing
    && entry?.benchmark?.targetMatches === true
    && entry?.benchmark?.accepted === true
    && entry?.execution?.memory
    && typeof entry.execution.memory.supported === 'boolean'
    && entry?.execution?.longTasks
    && typeof entry.execution.longTasks.supported === 'boolean'
    && entry?.execution?.timing
    && entry?.execution?.worker
  ))
  const checks = {
    reportStatus: report?.status === 'measured',
    caseCounts: report?.caseCounts?.total === expectedIds.length
      && report.caseCounts.measured === expectedIds.length
      && report.caseCounts.executionError === 0
      && report.caseCounts.productionRejected >= 2,
    caseIds: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    matrixCoverage: matrixCases.length === 9
      && matrixCases.every((entry) => (
        [202, 400, 600].some((target) => entry.id.includes(`${target}d`))
        && [0, 1, 9].some((kazanari) => entry.id.endsWith(`kazanari${kazanari}`))
      )),
    stressCoverage: stressCases.length === 2
      && stressCases.every((entry) => entry.production.status === 'planner-rejected'),
    caseShape,
    worker: report?.worker?.status === 'production-runtime-observed'
      && report.worker.counters.workerCreated > 0
      && report.worker.counters.workerPostMessage > 0
      && report.worker.counters.workerMessage > 0
      && report.worker.counters.workerErrors === 0
      && report.worker.counters.workerMessageErrors === 0
      && report.worker.installError === null
      && report.worker.requestTimings.some((entry) => (
        isFiniteNonNegative(entry.responseElapsedMs)
      )),
    d10Fetch: d10Fetches.some((entry) => (
      entry.status === 200
      && entry.error === null
      && isFiniteNonNegative(entry.elapsedMs)
    )),
    longTasks: typeof longTasks?.supported === 'boolean'
      && (longTasks.supported
        ? Number.isSafeInteger(longTasks.count) && Array.isArray(longTasks.entries)
        : longTasks.count === null && longTasks.entries === null),
    cancel: report?.diagnostics?.cancel?.status === 'measured'
      && report.diagnostics.cancel.abortSent === true
      && report.diagnostics.cancel.error?.name === 'AbortError',
    stale: report?.diagnostics?.stale?.status === 'measured'
      && report.diagnostics.stale.firstCommit === false
      && report.diagnostics.stale.secondCommit === true
      && report.diagnostics.stale.runnerErrors.length === 0,
    pageErrors: capturedPageErrors.length === 0
      && (report?.pageErrors?.length ?? 0) === 0
      && (report?.unhandledRejections?.length ?? 0) === 0,
  }
  return {
    valid: Object.values(checks).every(Boolean),
    checks,
    reportedCaseCounts: report?.caseCounts ?? {},
    chrome: {
      desktop: chrome?.status ?? 'missing',
      cpu4x: chromeCpu?.status ?? 'missing',
    },
  }
}

function summarizeCanonicalTimings(report) {
  const caseTimings = (report?.cases ?? []).map((entry) => ({
    id: entry?.id ?? null,
    status: entry?.status ?? null,
    coldInvocationMedianMs:
      entry?.stage?.cold?.invocationElapsedMs?.medianMs ?? null,
    warmInvocationMedianMs:
      entry?.stage?.warm?.invocationElapsedMs?.medianMs ?? null,
  }))
  const measuredTimings = caseTimings.filter(
    (entry) => entry.status === 'measured'
      && isFiniteNonNegative(entry.coldInvocationMedianMs)
      && isFiniteNonNegative(entry.warmInvocationMedianMs),
  )
  const warmValues = measuredTimings.map(
    (entry) => entry.warmInvocationMedianMs,
  )
  const coldValues = measuredTimings.map(
    (entry) => entry.coldInvocationMedianMs,
  )
  return {
    measuredCaseCount: measuredTimings.length,
    warmInvocationMedianMaximumMs: warmValues.length > 0
      ? Math.max(...warmValues)
      : null,
    coldInvocationMedianMaximumMs: coldValues.length > 0
      ? Math.max(...coldValues)
      : null,
    caseTimings,
  }
}

function summarizeCanonicalWorker(report) {
  const counters = report?.worker?.counters ?? {}
  return {
    status: report?.worker?.status ?? null,
    counters: {
      workerCreated: counters.workerCreated ?? null,
      workerPostMessage: counters.workerPostMessage ?? null,
      workerMessage: counters.workerMessage ?? null,
      workerTransferCount: counters.workerTransferCount ?? null,
      workerTransferBytes: counters.workerTransferBytes ?? null,
      workerErrors: counters.workerErrors ?? null,
      workerMessageErrors: counters.workerMessageErrors ?? null,
      workerTerminated: counters.workerTerminated ?? null,
    },
    instanceCount: Array.isArray(report?.worker?.instances)
      ? report.worker.instances.length
      : null,
  }
}

function summarizeCanonicalAssets(report) {
  const fetches = Array.isArray(report?.assets?.fetches)
    ? report.assets.fetches
    : []
  const d10Fetches = fetches.filter((entry) => (
    /(?:^|\/)d10(?:\/|\.|$)/i.test(entry?.path ?? '')
  ))
  return {
    fetchCallCount: report?.assets?.fetchCallCount ?? null,
    d10Fetches,
    resourceEntries: Array.isArray(report?.assets?.resourceEntries)
      ? report.assets.resourceEntries.filter((entry) => (
          /(?:^|\/)d10(?:\/|\.|$)/i.test(entry?.path ?? '')
        ))
      : [],
  }
}

function validateCanonicalAttackReport(report, capturedPageErrors) {
  const counts = report?.caseCounts ?? {}
  const cases = Array.isArray(report?.cases) ? report.cases : []
  const actualIds = cases.map((entry) => entry?.id)
  const expectedIds = EXPECTED_CASE_IDS.slice().sort()
  const sortedActualIds = actualIds.slice().sort()
  const reportedIds = Array.isArray(report?.caseIds)
    ? report.caseIds.slice().sort()
    : []
  const workerSummary = summarizeCanonicalWorker(report)
  const workerCounters = workerSummary.counters
  const timingSummary = summarizeCanonicalTimings(report)
  const assetSummary = summarizeCanonicalAssets(report)
  const d10Successes = assetSummary.d10Fetches.filter((entry) => (
    entry?.status === 200
      && entry?.error === null
      && isFiniteNonNegative(entry?.elapsedMs)
  ))
  const cancel = report?.diagnostics?.cancel
  const stale = report?.diagnostics?.stale
  const checks = {
    reportStatus: report?.status === 'measured',
    caseCounts: counts.total === EXPECTED_CASE_IDS.length
      && counts.measured === 5
      && counts.plannerOnly === 1
      && counts.plannerRejected === 1
      && counts.error === 0,
    caseIds: JSON.stringify(sortedActualIds) === JSON.stringify(expectedIds)
      && JSON.stringify(reportedIds) === JSON.stringify(expectedIds),
    timingSummary: timingSummary.measuredCaseCount === 5
      && isFiniteNonNegative(timingSummary.warmInvocationMedianMaximumMs)
      && isFiniteNonNegative(timingSummary.coldInvocationMedianMaximumMs),
    pageErrors: capturedPageErrors.length === 0
      && (report?.pageErrors?.length ?? 0) === 0
      && (report?.unhandledRejections?.length ?? 0) === 0,
    worker: workerSummary.status === 'production-runtime-observed'
      && workerSummary.instanceCount > 0
      && workerCounters.workerCreated > 0
      && workerCounters.workerPostMessage > 0
      && workerCounters.workerMessage > 0
      && workerCounters.workerTransferCount > 0
      && workerCounters.workerTransferBytes > 0
      && workerCounters.workerErrors === 0
      && workerCounters.workerMessageErrors === 0
      && (report?.worker?.errors?.length ?? 0) === 0
      && report?.worker?.installError === null,
    cancel: cancel?.status === 'measured'
      && cancel.abortBoundary === 'onRangePlan-preflight'
      && cancel.abortSent === true
      && cancel.result?.status === 'aborted'
      && cancel.result?.error?.name === 'AbortError',
    stale: stale?.status === 'measured'
      && stale.firstCommit === false
      && stale.secondCommit === true
      && Array.isArray(stale.runnerErrors)
      && stale.runnerErrors.length === 0,
    d10Fetch: d10Successes.length > 0,
    fetchDiagnostics: report?.diagnostics?.fetchInstallError === null,
  }
  return {
    valid: Object.values(checks).every(Boolean),
    checks,
    reportedCaseCounts: counts,
    timingSummary,
    workerSummary,
    assetSummary,
  }
}

function validateNumericDigests(report) {
  const issues = []
  const stageReports = []
  if (report?.assetSetup) {
    stageReports.push(['assetSetup', report.assetSetup])
  }
  for (const caseReport of report?.cases ?? []) {
    for (const stage of caseReport?.stages ?? []) {
      stageReports.push([`${caseReport.id}:${stage.name}`, stage])
    }
  }

  for (const [path, stage] of stageReports) {
    if (stage?.status !== 'measured') {
      continue
    }
    const digest = stage.numericDigest
    if (
      !digest
      || !Number.isFinite(digest.cold)
      || !Number.isFinite(digest.warm)
    ) {
      issues.push({ path, digest: digest ?? null })
    }
  }

  return {
    valid: issues.length === 0,
    measuredStageCount: stageReports.filter(
      ([, stage]) => stage?.status === 'measured',
    ).length,
    issues,
  }
}

function getStageMedian(caseReport, stageName) {
  const stage = caseReport?.stages?.find((entry) => entry.name === stageName)
  return stage?.warm?.invocationElapsedMs?.medianMs ?? null
}

function summarizeTimings(report, target = TARGET_CONFIGS.core) {
  if (target.id === 'canonical-attack') {
    return summarizeCanonicalTimings(report)
  }

  const measuredCases = (report?.cases ?? [])
    .filter((entry) => entry.status === 'measured')
  const canonical = measuredCases
    .map((entry) => getStageMedian(entry, 'canonical-damage'))
    .filter((value) => Number.isFinite(value))
  const legacy = measuredCases
    .map((entry) => getStageMedian(entry, 'legacy-damage'))
    .filter((value) => Number.isFinite(value))
  return {
    measuredCaseCount: measuredCases.length,
    canonicalDamageWarmMedianMaximumMs: canonical.length > 0
      ? Math.max(...canonical)
      : null,
    legacyDamageWarmMedianMaximumMs: legacy.length > 0
      ? Math.max(...legacy)
      : null,
    assetSetupWarmMedianMs:
      report?.assetSetup?.warm?.invocationElapsedMs?.medianMs ?? null,
  }
}

async function runEngine(engineConfig, baseUrl, options, target) {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'phase2h-playwright-'))
  let context = null
  let browser = null
  let page = null
  let cdpSession = null
  let cpuThrottlingApplied = false
  const capturedPageErrors = []
  const cleanupErrors = []
  const cleanup = {
    page: 'not-created',
    browser: 'not-created',
    context: 'not-created',
    cpuThrottling: engineConfig.cpuThrottlingRate === null
      ? 'not-applicable'
      : 'not-applied',
    temporaryProfile: 'not-removed',
    errors: cleanupErrors,
  }
  let engineReport = {
    id: engineConfig.id,
    label: engineConfig.label,
    status: 'error',
    cpuThrottlingRate: engineConfig.cpuThrottlingRate,
    error: null,
    capturedPageErrors,
    cleanup,
  }

  try {
    context = await engineConfig.browserType.launchPersistentContext(
      profileDirectory,
      engineConfig.launchOptions,
    )
    cleanup.context = 'created'
    browser = context.browser()
    cleanup.browser = browser ? 'created' : 'not-exposed'
    const browserVersion = browser?.version?.() ?? null
    page = await context.newPage()
    cleanup.page = 'created'
    page.on('pageerror', (error) => {
      capturedPageErrors.push({ type: 'pageerror', message: formatError(error) })
    })
    if (engineConfig.cpuThrottlingRate !== null) {
      cdpSession = await context.newCDPSession(page)
      await cdpSession.send('Emulation.setCPUThrottlingRate', {
        rate: engineConfig.cpuThrottlingRate,
      })
      cpuThrottlingApplied = true
      cleanup.cpuThrottling = 'applied'
    }
    await page.goto(buildBenchmarkUrl(baseUrl, options, target), {
      waitUntil: 'load',
      timeout: DEFAULT_TIMEOUT_MILLISECONDS,
    })
    await page.waitForFunction(
      ({ resultGlobal, errorGlobal }) => Boolean(
        window[resultGlobal] || window[errorGlobal]
      ),
      {
        resultGlobal: target.resultGlobal,
        errorGlobal: target.errorGlobal,
      },
      { timeout: DEFAULT_TIMEOUT_MILLISECONDS },
    )
    const result = await page.evaluate(
      (resultGlobal) => window[resultGlobal] ?? null,
      target.resultGlobal,
    )
    const pageFailure = await page.evaluate(
      (errorGlobal) => window[errorGlobal] ?? null,
      target.errorGlobal,
    )
    if (pageFailure) {
      throw new Error(`browser benchmark failed: ${pageFailure}`)
    }
    if (!result) {
      throw new Error('browser benchmark did not publish a result')
    }
    const validation = validateReport(result, capturedPageErrors, target)
    engineReport = {
      ...engineReport,
      status: validation.valid ? 'measured' : 'error',
      browserVersion,
      report: result,
      validation,
      timingSummary: summarizeTimings(result, target),
      ...(target.id === 'canonical-attack'
        ? {
            workerSummary: summarizeCanonicalWorker(result),
            assetSummary: summarizeCanonicalAssets(result),
          }
        : {}),
      error: validation.valid ? null : 'browser benchmark report failed validation',
    }
  } catch (error) {
    engineReport = {
      ...engineReport,
      status: 'error',
      error: formatError(error),
    }
  } finally {
    if (cdpSession && cpuThrottlingApplied) {
      try {
        await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        cleanup.cpuThrottling = 'reset'
      } catch (error) {
        cleanupErrors.push(`CPU throttling reset: ${formatError(error)}`)
      }
    }
    if (cdpSession) {
      try {
        await cdpSession.detach()
      } catch (error) {
        cleanupErrors.push(`CDP session detach: ${formatError(error)}`)
      }
    }
    if (page) {
      try {
        await page.close()
        cleanup.page = 'closed'
      } catch (error) {
        cleanupErrors.push(`page close: ${formatError(error)}`)
      }
    }
    if (context) {
      try {
        await context.close()
        cleanup.context = 'closed'
        cleanup.browser = 'closed'
      } catch (error) {
        cleanupErrors.push(`context close: ${formatError(error)}`)
        if (browser) {
          try {
            await browser.close()
            cleanup.browser = 'closed'
          } catch (browserError) {
            cleanupErrors.push(`browser close: ${formatError(browserError)}`)
          }
        }
      }
    }
    try {
      await rm(profileDirectory, { recursive: true, force: true })
      cleanup.temporaryProfile = 'removed'
    } catch (error) {
      cleanupErrors.push(`temporary profile removal: ${formatError(error)}`)
    }
    if (cleanupErrors.length > 0 && engineReport.status === 'measured') {
      engineReport = {
        ...engineReport,
        status: 'error',
        error: 'engine cleanup failed',
      }
    }
    engineReport = {
      ...engineReport,
      capturedPageErrors,
      cleanup,
    }
  }
  return engineReport
}

async function run(options) {
  if (process.version !== `v${EXPECTED_NODE_VERSION}`) {
    throw new Error(
      `Node ${process.version} is not the required v${EXPECTED_NODE_VERSION}`,
    )
  }

  const target = getTargetConfig(options.target)
  const engineConfigs = getEngineConfigs(options, target)
  const includeChrome = options.includeChrome || target.chromeOnly === true
  const report = {
    metadata: {
      benchmark: target.benchmarkName,
      target: target.id,
      node: process.version,
      playwright: PLAYWRIGHT_VERSION,
      benchmarkPath: target.benchmarkPath,
      requestedIterations: options.iterations,
      requestedWarmup: options.warmup,
      engines: engineConfigs.map(({ id }) => id),
      includeChrome,
      cpuThrottling: {
        engine: 'chrome-cpu-4x',
        method: 'Emulation.setCPUThrottlingRate via CDP',
        rate: 4,
        interpretation: 'renderer scheduling emulation multiplier; not physical CPU time',
      },
      omittedEngines: target.omittedEngines ?? (includeChrome
        ? []
        : [{
            id: 'chrome',
            status: 'omitted',
            reason: 'unthrottled Chrome is omitted by default to avoid duplicating the parent Chrome measurement; use --include-chrome to opt in',
          }]),
      resultsPersisted: false,
    },
    status: 'error',
    vite: {
      status: 'not-started',
      port: null,
      cleanup: null,
    },
    engines: [],
    error: null,
  }
  let viteServer = null

  try {
    viteServer = await startViteServer(target)
    report.vite = {
      status: 'started',
      port: viteServer.port,
      url: viteServer.url,
      cleanup: null,
    }
    const baseUrl = `http://127.0.0.1:${viteServer.port}`
    for (const engineConfig of engineConfigs) {
      report.engines.push(
        await runEngine(engineConfig, baseUrl, options, target),
      )
    }
    report.status = report.engines.every(
      (engine) => engine.status === 'measured',
    ) ? 'measured' : 'error'
  } catch (error) {
    report.error = formatError(error)
  } finally {
    const viteCleanup = await stopViteServer(viteServer)
    report.vite = {
      ...report.vite,
      cleanup: viteCleanup,
      status: viteCleanup.stopped && report.vite.status === 'started'
        ? 'stopped'
        : report.vite.status,
    }
    if (!viteCleanup.stopped && !report.error) {
      report.error = viteCleanup.error
    }
  }

  return report
}

let options
try {
  options = parseArgs()
  if (options.help) {
    process.stdout.write(`${helpText()}\n`)
  } else {
    const report = await run(options)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.status !== 'measured' || report.error) {
      process.exitCode = 1
    }
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: 'error',
    error: formatError(error),
  }, null, 2)}\n`)
  process.exitCode = 1
}
