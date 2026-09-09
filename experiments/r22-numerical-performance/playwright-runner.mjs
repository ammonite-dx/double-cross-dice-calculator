import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/r22-numerical-performance/benchmark.html'
const RESULTS_DIRECTORY = fileURLToPath(new URL('./results/', import.meta.url))
const HOST = '127.0.0.1'
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const VITE_TIMEOUT_MS = 30 * 1000
const MAX_ITERATIONS = 100
const MAX_WARMUP = 20
const MAX_RUNS = 10

const ENGINE_CONFIGS = Object.freeze({
  chrome: Object.freeze({
    id: 'chrome',
    label: "Playwright Chrome channel 'chrome'",
    browserType: chromium,
    launchOptions: { channel: 'chrome', headless: true },
    cpuThrottlingRate: null,
  }),
  'chrome-cpu-4x': Object.freeze({
    id: 'chrome-cpu-4x',
    label: "Playwright Chrome channel 'chrome' with CDP CPU throttling 4x",
    browserType: chromium,
    launchOptions: { channel: 'chrome', headless: true },
    cpuThrottlingRate: 4,
  }),
  firefox: Object.freeze({
    id: 'firefox',
    label: 'Playwright Firefox',
    browserType: firefox,
    launchOptions: { headless: true },
    cpuThrottlingRate: null,
  }),
  webkit: Object.freeze({
    id: 'webkit',
    label: 'Playwright WebKit',
    browserType: webkit,
    launchOptions: { headless: true },
    cpuThrottlingRate: null,
  }),
})

function formatError(error) {
  return String(error?.stack ?? error)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
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

function appendOutput(current, chunk) {
  const next = `${current}${chunk}`
  return next.length > 20_000 ? next.slice(-20_000) : next
}

async function startVite() {
  const port = await getFreePort()
  const child = spawn(
    process.execPath,
    [
      VITE_BIN,
      '--config',
      VITE_CONFIG,
      '--host',
      HOST,
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  let stdout = ''
  let stderr = ''
  let spawnError = null
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout = appendOutput(stdout, chunk) })
  child.stderr.on('data', (chunk) => { stderr = appendOutput(stderr, chunk) })
  child.on('error', (error) => { spawnError = error })

  const baseUrl = `http://${HOST}:${port}`
  const startedAt = Date.now()
  let lastError = 'not attempted'
  try {
    while (Date.now() - startedAt < VITE_TIMEOUT_MS) {
      if (spawnError) {
        throw spawnError
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Vite exited before readiness (code=${child.exitCode}, signal=${child.signalCode})`
        )
      }
      try {
        const response = await fetch(`${baseUrl}${BENCHMARK_PATH}`, {
          signal: AbortSignal.timeout(1_000),
        })
        if (response.ok) {
          return { child, baseUrl, port }
        }
        lastError = `HTTP ${response.status}`
      } catch (error) {
        lastError = formatError(error)
      }
      await delay(100)
    }
    throw new Error([
      `Vite did not become ready within ${VITE_TIMEOUT_MS} ms`,
      `last readiness error: ${lastError}`,
      `stdout:\n${stdout.trim()}`,
      `stderr:\n${stderr.trim()}`,
    ].join('\n'))
  } catch (error) {
    await stopVite({ child })
    throw error
  }
}

async function stopVite(server) {
  if (!server?.child) {
    return
  }
  const child = server.child
  if (child.exitCode === null && child.signalCode === null) {
    child.kill()
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(5_000),
    ])
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
  }
}

function parseCount(raw, name, maximum, allowZero = false) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer`)
  }
  const value = Number(raw)
  if (
    !Number.isSafeInteger(value)
    || value > maximum
    || (!allowZero && value === 0)
  ) {
    throw new Error(`${name} must be ${allowZero ? '0' : '1'}..${maximum}`)
  }
  return value
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    iterations: null,
    warmup: null,
    runs: 3,
    engines: ['chrome', 'chrome-cpu-4x'],
    help: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--cross-engine') {
      options.engines = ['chrome', 'chrome-cpu-4x', 'firefox', 'webkit']
      continue
    }
    const engineMatch = /^(--engines)(?:=(.*))?$/.exec(argument)
    if (engineMatch) {
      const raw = engineMatch[2] ?? args[++index]
      if (!raw) {
        throw new Error('--engines requires a comma-separated value')
      }
      options.engines = raw.split(',').map((id) => id.trim()).filter(Boolean)
      continue
    }
    const countMatch = /^(--iterations|--warmup|--runs)(?:=(.*))?$/.exec(argument)
    if (!countMatch) {
      throw new Error(`unknown argument: ${argument}`)
    }
    const raw = countMatch[2] ?? args[++index]
    if (raw === undefined) {
      throw new Error(`${countMatch[1]} requires a value`)
    }
    const name = countMatch[1]
    const value = parseCount(
      raw,
      name,
      name === '--iterations'
        ? MAX_ITERATIONS
        : name === '--warmup' ? MAX_WARMUP : MAX_RUNS,
      name === '--warmup'
    )
    if (name === '--iterations') {
      options.iterations = value
    } else if (name === '--warmup') {
      options.warmup = value
    } else {
      options.runs = value
    }
  }
  for (const engine of options.engines) {
    if (!ENGINE_CONFIGS[engine]) {
      throw new Error(`unknown engine: ${engine}`)
    }
  }
  if (options.engines.length === 0) {
    throw new Error('--engines must contain at least one engine')
  }
  return options
}

function helpText() {
  return [
    'Usage: node experiments/r22-numerical-performance/playwright-runner.mjs [options]',
    '',
    '--iterations N       warm samples per fixture (1..100)',
    '--warmup N           warmup samples per fixture (0..20)',
    '--runs N             complete browser runs per engine (1..10; default 3)',
    '--engines LIST       comma-separated chrome,chrome-cpu-4x,firefox,webkit',
    '--cross-engine       run all supported Playwright engines',
  ].join('\n')
}

function validateReport(payload) {
  const errors = []
  if (payload.error !== null) {
    errors.push(payload.error)
  }
  const report = payload.result
  if (!report || report.status !== 'measured') {
    errors.push('browser benchmark did not publish a measured report')
  }
  if (report?.traceParity?.some(({ equal }) => equal !== true)) {
    errors.push('trace parity failed')
  }
  for (const mode of ['steadyState', 'cacheMiss']) {
    for (const measurement of report?.modes?.[mode] ?? []) {
      if (measurement.status !== 'measured' || measurement.errors.length > 0) {
        errors.push(`${mode}/${measurement.id} did not measure successfully`)
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  }
}

async function runSingle(server, engineId, options, runIndex) {
  const engine = ENGINE_CONFIGS[engineId]
  let browser = null
  let context = null
  let page = null
  const pageErrors = []
  const consoleErrors = []
  try {
    browser = await engine.browserType.launch(engine.launchOptions)
    context = await browser.newContext()
    page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(formatError(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    if (engine.cpuThrottlingRate !== null) {
      await page.addInitScript((rate) => {
        window.__r22CpuThrottle = rate
      }, engine.cpuThrottlingRate)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: engine.cpuThrottlingRate,
      })
    }

    const query = new URLSearchParams()
    if (options.iterations !== null) {
      query.set('iterations', String(options.iterations))
    }
    if (options.warmup !== null) {
      query.set('warmup', String(options.warmup))
    }
    await page.goto(
      `${server.baseUrl}${BENCHMARK_PATH}?${query.toString()}`,
      { waitUntil: 'load', timeout: DEFAULT_TIMEOUT_MS }
    )
    await page.waitForFunction(
      () => window.__r22NumericalPerformanceResult !== undefined
        || window.__r22NumericalPerformanceError !== undefined,
      { timeout: DEFAULT_TIMEOUT_MS }
    )
    const payload = await page.evaluate(() => ({
      result: window.__r22NumericalPerformanceResult ?? null,
      error: window.__r22NumericalPerformanceError ?? null,
    }))
    const validation = validateReport(payload)
    return {
      run: runIndex + 1,
      status: validation.valid && pageErrors.length === 0 && consoleErrors.length === 0
        ? 'passed'
        : 'error',
      report: payload.result,
      error: payload.error,
      validationErrors: validation.errors,
      pageErrors,
      consoleErrors,
    }
  } catch (error) {
    return {
      run: runIndex + 1,
      status: 'unavailable',
      report: null,
      error: formatError(error),
      validationErrors: [],
      pageErrors,
      consoleErrors,
    }
  } finally {
    await page?.close().catch(() => {})
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
  }
}

function repeatableTriggers(runs) {
  const byKey = new Map()
  for (const run of runs) {
    for (const trigger of run.report?.triggerEvaluation?.potentialTriggers ?? []) {
      const key = `${trigger.id}:${trigger.reason}`
      const entry = byKey.get(key) ?? { ...trigger, key, runs: [] }
      entry.runs.push(run.run)
      byKey.set(key, entry)
    }
  }
  return Array.from(byKey.values())
    .filter(({ runs: observedRuns }) => observedRuns.length >= 2)
    .map(({ key, runs: observedRuns, ...trigger }) => ({
      ...trigger,
      key,
      runs: observedRuns,
    }))
}

function summarizeEngine(engine, options, runs) {
  const repeatable = repeatableTriggers(runs)
  const passed = runs.filter(({ status }) => status === 'passed').length
  const unavailable = runs.filter(({ status }) => status === 'unavailable').length
  const status = passed === runs.length
    ? 'passed'
    : passed > 0 ? 'partial' : unavailable === runs.length ? 'unavailable' : 'error'
  return {
    schemaVersion: 1,
    benchmark: 'r22-numerical-performance',
    engine: engine.id,
    label: engine.label,
    status,
    requested: {
      iterations: options.iterations,
      warmup: options.warmup,
      runs: options.runs,
    },
    runs,
    repeatability: {
      requiredRuns: 3,
      requiredMatches: 2,
      observedPassedRuns: passed,
      repeatableTriggers: repeatable,
    },
    decision: repeatable.length > 0
      ? 'optimization-review-required'
      : 'no-repeatable-trigger-observed',
  }
}

async function run(options) {
  if (options.help) {
    console.log(helpText())
    return 0
  }
  let server = null
  try {
    server = await startVite()
    const engines = []
    for (const engineId of options.engines) {
      const engine = ENGINE_CONFIGS[engineId]
      const runs = []
      for (let index = 0; index < options.runs; index += 1) {
        runs.push(await runSingle(server, engineId, options, index))
      }
      const report = summarizeEngine(engine, options, runs)
      await mkdir(RESULTS_DIRECTORY, { recursive: true })
      await writeFile(
        `${RESULTS_DIRECTORY}baseline-${engineId}.json`,
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
      )
      engines.push(report)
    }
    const hasError = engines.some(({ status }) => status === 'error')
    const hasPassed = engines.some(({ status }) => status === 'passed')
    const status = hasError ? 'error' : hasPassed ? 'passed' : 'unavailable'
    console.log(JSON.stringify({
      schemaVersion: 1,
      benchmark: 'r22-numerical-performance',
      status,
      requested: options,
      engines,
    }, null, 2))
    return status === 'error' ? 1 : 0
  } catch (error) {
    console.error(formatError(error))
    return 1
  } finally {
    await stopVite(server)
  }
}

function isMainModule() {
  return process.argv[1] !== undefined
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
}

if (isMainModule()) {
  const options = parseArgs()
  process.exitCode = await run(options)
}
