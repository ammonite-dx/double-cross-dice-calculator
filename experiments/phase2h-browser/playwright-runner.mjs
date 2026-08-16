import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'

import { firefox, webkit } from 'playwright'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/phase2h-browser/browser-benchmark.html'
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

const ENGINE_CONFIGS = [
  {
    id: 'firefox',
    label: 'Playwright Firefox',
    browserType: firefox,
  },
  {
    id: 'webkit',
    label: 'Playwright WebKit',
    browserType: webkit,
  },
]

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
    iterations: null,
    warmup: null,
    help: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
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
    `  --iterations N  Override warm samples (1..${MAX_ITERATIONS})`,
    `  --warmup N      Override warmup samples (0..${MAX_WARMUP_ITERATIONS})`,
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

function buildBenchmarkUrl(baseUrl, options) {
  const params = new URLSearchParams()
  if (options.iterations !== null) {
    params.set('iterations', String(options.iterations))
  }
  if (options.warmup !== null) {
    params.set('warmup', String(options.warmup))
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return `${baseUrl}${BENCHMARK_PATH}${suffix}`
}

function validateReport(report, capturedPageErrors = []) {
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
  const checks = {
    reportStatus: report?.status === 'measured',
    caseCounts: counts.total === EXPECTED_CASE_IDS.length
      && counts.measured === 5
      && counts.plannerOnly === 1
      && counts.plannerRejected === 1
      && counts.error === 0,
    caseIds: JSON.stringify(sortedActualIds) === JSON.stringify(expectedIds),
    stageErrors: stageErrors.length === 0,
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
    reportedCaseCounts: counts,
  }
}

function getStageMedian(caseReport, stageName) {
  const stage = caseReport?.stages?.find((entry) => entry.name === stageName)
  return stage?.warm?.invocationElapsedMs?.medianMs ?? null
}

function summarizeTimings(report) {
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

async function runEngine(engineConfig, baseUrl, options) {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'phase2h-playwright-'))
  let context = null
  const capturedPageErrors = []
  const cleanupErrors = []
  const cleanup = {
    context: 'not-created',
    temporaryProfile: 'not-removed',
    errors: cleanupErrors,
  }
  let engineReport = {
    id: engineConfig.id,
    label: engineConfig.label,
    status: 'error',
    error: null,
    capturedPageErrors,
    cleanup,
  }

  try {
    context = await engineConfig.browserType.launchPersistentContext(
      profileDirectory,
      { headless: true },
    )
    cleanup.context = 'created'
    const page = await context.newPage()
    page.on('pageerror', (error) => {
      capturedPageErrors.push({ type: 'pageerror', message: formatError(error) })
    })
    await page.goto(buildBenchmarkUrl(baseUrl, options), {
      waitUntil: 'load',
      timeout: DEFAULT_TIMEOUT_MILLISECONDS,
    })
    await page.waitForFunction(
      () => Boolean(
        window.__phase2hBrowserBenchmarkResult
        || window.__phase2hBrowserBenchmarkError
      ),
      { timeout: DEFAULT_TIMEOUT_MILLISECONDS },
    )
    const result = await page.evaluate(
      () => window.__phase2hBrowserBenchmarkResult ?? null,
    )
    const pageFailure = await page.evaluate(
      () => window.__phase2hBrowserBenchmarkError ?? null,
    )
    if (pageFailure) {
      throw new Error(`browser benchmark failed: ${pageFailure}`)
    }
    if (!result) {
      throw new Error('browser benchmark did not publish a result')
    }
    const validation = validateReport(result, capturedPageErrors)
    const browser = context.browser()
    engineReport = {
      ...engineReport,
      status: validation.valid ? 'measured' : 'error',
      browserVersion: browser?.version?.() ?? null,
      report: result,
      validation,
      timingSummary: summarizeTimings(result),
      error: validation.valid ? null : 'browser benchmark report failed validation',
    }
    await page.close()
  } catch (error) {
    engineReport = {
      ...engineReport,
      status: 'error',
      error: formatError(error),
    }
  } finally {
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

async function run(options) {
  if (process.version !== `v${EXPECTED_NODE_VERSION}`) {
    throw new Error(
      `Node ${process.version} is not the required v${EXPECTED_NODE_VERSION}`,
    )
  }

  const report = {
    metadata: {
      benchmark: 'phase2h-browser-playwright',
      node: process.version,
      playwright: PLAYWRIGHT_VERSION,
      benchmarkPath: BENCHMARK_PATH,
      requestedIterations: options.iterations,
      requestedWarmup: options.warmup,
      engines: ENGINE_CONFIGS.map(({ id }) => id),
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
    const baseUrl = `http://127.0.0.1:${viteServer.port}`
    for (const engineConfig of ENGINE_CONFIGS) {
      report.engines.push(await runEngine(engineConfig, baseUrl, options))
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
