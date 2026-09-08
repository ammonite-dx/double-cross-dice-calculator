import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/r19-worker-architecture/benchmark.html'
const HOST = '127.0.0.1'
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const VITE_TIMEOUT_MS = 30 * 1000
const MAX_ITERATIONS = 20
const MAX_WARMUP = 10

const ENGINE_CONFIGS = {
  chrome: {
    id: 'chrome',
    label: "Playwright Chrome channel 'chrome'",
    browserType: chromium,
    launchOptions: { channel: 'chrome', headless: true },
    cpuThrottlingRate: null,
  },
  'chrome-cpu-4x': {
    id: 'chrome-cpu-4x',
    label: "Playwright Chrome channel 'chrome' with CDP CPU throttling 4x",
    browserType: chromium,
    launchOptions: { channel: 'chrome', headless: true },
    cpuThrottlingRate: 4,
  },
  firefox: {
    id: 'firefox',
    label: 'Playwright Firefox',
    browserType: firefox,
    launchOptions: { headless: true },
    cpuThrottlingRate: null,
  },
  webkit: {
    id: 'webkit',
    label: 'Playwright WebKit',
    browserType: webkit,
    launchOptions: { headless: true },
    cpuThrottlingRate: null,
  },
}

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

function parseCount(raw, name, maximum, allowZero) {
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

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    iterations: null,
    warmup: null,
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
    const countMatch = /^(--iterations|--warmup)(?:=(.*))?$/.exec(argument)
    if (!countMatch) {
      throw new Error(`unknown argument: ${argument}`)
    }
    const raw = countMatch[2] ?? args[++index]
    if (raw === undefined) {
      throw new Error(`${countMatch[1]} requires a value`)
    }
    const isIterations = countMatch[1] === '--iterations'
    options[isIterations ? 'iterations' : 'warmup'] = parseCount(
      raw,
      countMatch[1],
      isIterations ? MAX_ITERATIONS : MAX_WARMUP,
      !isIterations
    )
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
    'Usage: node experiments/r19-worker-architecture/playwright-runner.mjs [options]',
    '',
    '--iterations N       warm samples per fixture (1..20)',
    '--warmup N           warmup samples per fixture (0..10)',
    '--engines LIST       comma-separated chrome,chrome-cpu-4x,firefox,webkit',
    '--cross-engine       run all supported Playwright engines',
  ].join('\n')
}

async function runEngine(server, engineId, options) {
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
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: engine.cpuThrottlingRate,
      })
    }

    const query = new URLSearchParams({
      iterations: String(options.iterations ?? 3),
      warmup: String(options.warmup ?? 1),
    })
    await page.goto(
      `${server.baseUrl}${BENCHMARK_PATH}?${query.toString()}`,
      { waitUntil: 'load', timeout: DEFAULT_TIMEOUT_MS }
    )
    await page.waitForFunction(
      () => window.__r19WorkerArchitectureResult !== undefined
        || window.__r19WorkerArchitectureError !== undefined,
      { timeout: DEFAULT_TIMEOUT_MS }
    )
    const payload = await page.evaluate(() => ({
      result: window.__r19WorkerArchitectureResult ?? null,
      error: window.__r19WorkerArchitectureError ?? null,
    }))
    const reportStatus = payload.result?.status === 'passed'
      ? 'passed'
      : 'error'
    return {
      id: engine.id,
      label: engine.label,
      status: reportStatus,
      cpuThrottlingRate: engine.cpuThrottlingRate,
      report: payload.result,
      error: payload.error,
      pageErrors,
      consoleErrors,
    }
  } catch (error) {
    return {
      id: engine.id,
      label: engine.label,
      status: 'unavailable',
      cpuThrottlingRate: engine.cpuThrottlingRate,
      report: null,
      error: formatError(error),
      pageErrors,
      consoleErrors,
    }
  } finally {
    await page?.close().catch(() => {})
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
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
      engines.push(await runEngine(server, engineId, options))
    }
    const passed = engines.filter(({ status }) => status === 'passed').length
    const unavailable = engines.filter(({ status }) => status === 'unavailable').length
    const status = passed > 0
      ? passed === engines.length ? 'passed' : 'partial'
      : unavailable === engines.length ? 'unavailable' : 'error'
    console.log(JSON.stringify({
      schemaVersion: 1,
      benchmark: 'r19-worker-architecture',
      status,
      requested: {
        iterations: options.iterations ?? 3,
        warmup: options.warmup ?? 1,
        engines: options.engines,
      },
      engines,
    }, null, 2))
    // Missing browser executables are recorded as unavailable and do not
    // make a measurement run fail. A real benchmark/protocol error does.
    return status === 'error' ? 1 : 0
  } catch (error) {
    console.error(formatError(error))
    return 1
  } finally {
    await stopVite(server)
  }
}

const options = parseArgs()
process.exitCode = await run(options)
