import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

import {
  chromium,
  firefox,
  webkit,
} from 'playwright'

import { BROWSER_CASES } from './benchmark-cases.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/dynamic-distribution-ranges/browser-benchmark.html'
const EXPECTED_NODE_VERSION = (
  await readFile(new URL('../../.node-version', import.meta.url), 'utf8')
).trim()
const PLAYWRIGHT_VERSION = JSON.parse(
  await readFile(new URL('../../node_modules/playwright/package.json', import.meta.url), 'utf8')
).version
const EXPECTED_BROWSER_CASE_IDS = new Set(
  BROWSER_CASES.map((testCase) => testCase.id)
)
const WARMUP_ITERATIONS = 2
const WARM_ITERATIONS = 7
const DEFAULT_TIMEOUT_MILLISECONDS = 10 * 60 * 1000
const VITE_START_TIMEOUT_MILLISECONDS = 30 * 1000

const ENGINE_CONFIGS = [
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function round(value) {
  return Number(value.toFixed(6))
}

function summarizeMaximum(values) {
  if (values.length === 0) {
    return null
  }
  return round(Math.max(...values))
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
  return new Promise((resolve) => {
    child.once('exit', resolve)
  })
}

async function startViteServer() {
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

  const url = `http://127.0.0.1:${port}${BENCHMARK_PATH}`
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
          return {
            child,
            port,
            url,
            stdout,
            stderr,
          }
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
      await Promise.race([
        waitForChildExit(child),
        delay(5000),
      ])
    }
    throw error
  }
}

async function stopViteServer(server) {
  if (!server) {
    return {
      stopped: true,
      error: null,
    }
  }

  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill()
    await Promise.race([
      waitForChildExit(server.child),
      delay(5000),
    ])
  }

  const stopped = server.child.exitCode !== null || server.child.signalCode !== null
  return {
    stopped,
    error: stopped
      ? null
      : 'Vite child process did not exit within 5000 ms',
  }
}

function summarizeNumericValidation(report) {
  const issues = []
  let summaryCount = 0

  function visit(value, path) {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (
      Object.hasOwn(value, 'nonFiniteCount') ||
      Object.hasOwn(value, 'negativeCount')
    ) {
      summaryCount += 1
      if (value.nonFiniteCount !== 0) {
        issues.push({
          path,
          field: 'nonFiniteCount',
          value: value.nonFiniteCount,
        })
      }
      if (value.negativeCount !== 0) {
        issues.push({
          path,
          field: 'negativeCount',
          value: value.negativeCount,
        })
      }
      if (!Number.isFinite(value.length) || value.length <= 0) {
        issues.push({
          path,
          field: 'length',
          value: value.length,
        })
      }
      if (Object.hasOwn(value, 'total') && !Number.isFinite(value.total)) {
        issues.push({
          path,
          field: 'total',
          value: value.total,
        })
      }
    }
    for (const [key, nested] of Object.entries(value)) {
      visit(nested, `${path}.${key}`)
    }
  }

  visit(report.cases, 'cases')
  return {
    valid: issues.length === 0,
    summaryCount,
    issueCount: issues.length,
    issues,
  }
}

function summarizeTimings(report) {
  const mainWarmP95 = []
  const mainWarmMedian = []
  const workerWarmP95 = []
  const workerCold = []
  const timerDelayWarmP95 = []
  let longTaskCount = 0

  for (const entry of report.cases ?? []) {
    if (entry.execution?.status !== 'measured') {
      continue
    }
    const mainMeasurement = entry.execution.paths?.main?.measurement
    if (mainMeasurement) {
      mainWarmP95.push(mainMeasurement.warm.p95Milliseconds)
      mainWarmMedian.push(mainMeasurement.warm.medianMilliseconds)
      timerDelayWarmP95.push(
        mainMeasurement.warm.mainThreadTimerDelayApproxMilliseconds.p95Milliseconds
      )
      longTaskCount += mainMeasurement.longTasks.count
    }
    const workerMeasurement = entry.execution.paths?.worker?.measurement
    if (workerMeasurement) {
      workerWarmP95.push(workerMeasurement.warm.p95Milliseconds)
      workerCold.push(workerMeasurement.cold.milliseconds)
      timerDelayWarmP95.push(
        workerMeasurement.warm.mainThreadTimerDelayApproxMilliseconds.p95Milliseconds
      )
      longTaskCount += workerMeasurement.longTasks.count
    }
  }

  return {
    representativeP95Milliseconds: {
      definition: 'maximum across the 12 browser cases for each measured path',
      mainThreadWarm: summarizeMaximum(mainWarmP95),
      workerWarmRoundTrip: summarizeMaximum(workerWarmP95),
    },
    mainThreadWarmMedianMaximumMilliseconds: summarizeMaximum(mainWarmMedian),
    workerColdMaximumMilliseconds: summarizeMaximum(workerCold),
    timerDelayWarmP95MaximumMilliseconds: summarizeMaximum(timerDelayWarmP95),
    longTaskCount,
  }
}

function validateBenchmarkReport(report, capturedPageErrors) {
  const cases = report?.cases ?? []
  const measuredCases = cases.filter(
    (entry) => entry.execution?.status === 'measured'
  )
  const measuredIds = new Set(measuredCases.map((entry) => entry.id))
  const missingCaseIds = [...EXPECTED_BROWSER_CASE_IDS].filter(
    (id) => !measuredIds.has(id)
  )
  const unexpectedMeasuredIds = [...measuredIds].filter(
    (id) => !EXPECTED_BROWSER_CASE_IDS.has(id)
  )
  const caseErrors = cases.filter(
    (entry) => entry.execution?.status === 'error'
  )
  const numericValidation = summarizeNumericValidation(report)
  const reportPageErrors = report?.diagnostics?.pageErrors ?? []
  const pageErrorCount = reportPageErrors.length + capturedPageErrors.length
  const expectedCaseCount = BROWSER_CASES.length
  const caseCounts = report?.metadata?.caseCounts ?? {}
  const checks = {
    browserCaseCount: caseCounts.browser === expectedCaseCount,
    measuredCaseCount: caseCounts.measured === expectedCaseCount,
    measuredIds: missingCaseIds.length === 0 && unexpectedMeasuredIds.length === 0,
    caseErrors: caseErrors.length === 0,
    pageErrors: pageErrorCount === 0,
    numericValidation: numericValidation.valid,
  }
  const valid = Object.values(checks).every(Boolean)

  return {
    valid,
    checks,
    expectedCaseCount,
    reportedCaseCounts: caseCounts,
    missingCaseIds,
    unexpectedMeasuredIds,
    caseErrors: caseErrors.map((entry) => ({
      id: entry.id,
      reason: entry.execution.reason,
    })),
    pageErrors: {
      count: pageErrorCount,
      report: reportPageErrors,
      captured: capturedPageErrors,
    },
    numericValidation,
  }
}

async function runEngine(engineConfig, baseUrl) {
  const profileDirectory = await mkdtemp(
    join(tmpdir(), 'dynamic-range-playwright-')
  )
  let context = null
  let page = null
  let cdpSession = null
  let cpuThrottlingApplied = false
  const capturedPageErrors = []
  const cleanupErrors = []
  const cleanup = {
    page: 'not-created',
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
    const browser = context.browser()
    const browserVersion = browser ? browser.version() : null
    page = await context.newPage()
    cleanup.page = 'created'
    page.on('pageerror', (error) => {
      capturedPageErrors.push({
        type: 'pageerror',
        message: formatError(error),
      })
    })

    if (engineConfig.cpuThrottlingRate !== null) {
      cdpSession = await context.newCDPSession(page)
      await cdpSession.send('Emulation.setCPUThrottlingRate', {
        rate: engineConfig.cpuThrottlingRate,
      })
      cpuThrottlingApplied = true
      cleanup.cpuThrottling = 'applied'
    }

    await page.goto(`${baseUrl}${BENCHMARK_PATH}`, {
      waitUntil: 'load',
      timeout: DEFAULT_TIMEOUT_MILLISECONDS,
    })
    await page.waitForFunction(
      () => Boolean(
        window.__dynamicRangeBenchmarkResult ||
        window.__dynamicRangeBenchmarkError
      ),
      { timeout: DEFAULT_TIMEOUT_MILLISECONDS },
    )
    const result = await page.evaluate(() => window.__dynamicRangeBenchmarkResult ?? null)
    const pageFailure = await page.evaluate(
      () => window.__dynamicRangeBenchmarkError ?? null
    )
    if (pageFailure) {
      throw new Error(`browser benchmark failed: ${pageFailure}`)
    }
    if (!result) {
      throw new Error('browser benchmark did not publish a result')
    }

    const validation = validateBenchmarkReport(result, capturedPageErrors)
    engineReport = {
      ...engineReport,
      status: validation.valid ? 'measured' : 'error',
      browserVersion,
      report: result,
      validation,
      timingSummary: summarizeTimings(result),
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
      } catch (error) {
        cleanupErrors.push(`context close: ${formatError(error)}`)
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

async function run() {
  if (process.version !== `v${EXPECTED_NODE_VERSION}`) {
    throw new Error(
      `Node ${process.version} is not the required v${EXPECTED_NODE_VERSION}`
    )
  }

  const report = {
    metadata: {
      benchmark: 'dynamic-distribution-ranges-phase2f',
      node: process.version,
      playwright: PLAYWRIGHT_VERSION,
      warmupIterations: WARMUP_ITERATIONS,
      warmIterations: WARM_ITERATIONS,
      browserCaseCount: BROWSER_CASES.length,
      benchmarkPath: BENCHMARK_PATH,
      cpuThrottling: {
        engine: 'Chrome channel only',
        method: 'Emulation.setCPUThrottlingRate',
        rate: 4,
      },
      sandboxFlag: 'no --no-sandbox flag was supplied',
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
    viteServer = await startViteServer()
    report.vite = {
      status: 'started',
      port: viteServer.port,
      url: viteServer.url,
      cleanup: null,
    }
    for (const engineConfig of ENGINE_CONFIGS) {
      report.engines.push(await runEngine(
        engineConfig,
        `http://127.0.0.1:${viteServer.port}`,
      ))
    }
    report.status = report.engines.every(
      (engine) => engine.status === 'measured'
    )
      ? 'measured'
      : 'error'
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

try {
  const report = await run()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.status !== 'measured' || report.error) {
    process.exitCode = 1
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    status: 'error',
    error: formatError(error),
    cleanup: 'Vite was not started or failed before the cleanup phase.',
  }, null, 2)}\n`)
  process.exitCode = 1
}
