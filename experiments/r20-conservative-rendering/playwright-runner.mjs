import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/r20-conservative-rendering/benchmark.html'
const HOST = '127.0.0.1'
const VITE_TIMEOUT_MS = 30_000
const BENCHMARK_TIMEOUT_MS = 15 * 60 * 1000
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
]

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function startVite() {
  const port = await getFreePort()
  const child = spawn(process.execPath, [
    VITE_BIN,
    '--config',
    VITE_CONFIG,
    '--host',
    HOST,
    '--port',
    String(port),
    '--strictPort',
  ], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-20_000) })
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-20_000) })
  const baseUrl = `http://${HOST}:${port}`
  const startedAt = Date.now()
  while (Date.now() - startedAt < VITE_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited early (code=${child.exitCode})\n${output}`)
    }
    try {
      const response = await fetch(`${baseUrl}${BENCHMARK_PATH}`)
      if (response.ok) {
        return { child, baseUrl }
      }
    } catch {
      // Retry until the startup deadline.
    }
    await delay(100)
  }
  throw new Error(`Vite did not become ready\n${output}`)
}

async function stopVite(server) {
  if (!server?.child || server.child.exitCode !== null) {
    return
  }
  server.child.kill()
  await Promise.race([
    new Promise((resolve) => server.child.once('exit', resolve)),
    delay(5_000),
  ])
  if (server.child.exitCode === null) {
    server.child.kill('SIGKILL')
  }
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    iterations: 1,
    warmup: 0,
    initialAnimationMs: 1_100,
    updateAnimationMs: 1_100,
    cpu4x: false,
    cases: null,
    datasets: null,
    markers: null,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--cpu-4x') {
      options.cpu4x = true
      continue
    }
    const listMatch = /^(--cases|--datasets|--markers)=(.+)$/.exec(argument)
    if (listMatch) {
      const key = {
        '--cases': 'cases',
        '--datasets': 'datasets',
        '--markers': 'markers',
      }[listMatch[1]]
      options[key] = listMatch[2]
      continue
    }
    const match = /^(--iterations|--warmup|--initial-animation-ms|--update-animation-ms)=(\d+)$/.exec(argument)
    if (!match) {
      throw new Error(`Unknown argument: ${argument}`)
    }
    const key = {
      '--iterations': 'iterations',
      '--warmup': 'warmup',
      '--initial-animation-ms': 'initialAnimationMs',
      '--update-animation-ms': 'updateAnimationMs',
    }[match[1]]
    options[key] = Number(match[2])
  }
  return options
}

const options = parseArgs()
let server = null
let browser = null
const reports = []
const consoleErrors = []

try {
  server = await startVite()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push({
          viewport: viewport.name,
          text: message.text(),
        })
      }
    })
    page.on('pageerror', (error) => {
      consoleErrors.push({
        viewport: viewport.name,
        text: String(error?.stack ?? error),
        source: 'pageerror',
      })
    })
    if (options.cpu4x) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    const query = new URLSearchParams({
      iterations: String(options.iterations),
      warmup: String(options.warmup),
      initialAnimationMs: String(options.initialAnimationMs),
      updateAnimationMs: String(options.updateAnimationMs),
    })
    for (const key of ['cases', 'datasets', 'markers']) {
      if (options[key] !== null) {
        query.set(key, options[key])
      }
    }
    await page.goto(`${server.baseUrl}${BENCHMARK_PATH}?${query}`, {
      waitUntil: 'networkidle',
    })
    await page.waitForFunction(() => (
      window.__r20ConservativeRenderingResult !== undefined
      || window.__r20ConservativeRenderingError !== undefined
    ), undefined, { timeout: BENCHMARK_TIMEOUT_MS })
    const report = await page.evaluate(() => (
      window.__r20ConservativeRenderingResult
      ?? window.__r20ConservativeRenderingError
    ))
    reports.push({ viewport, report })
    await context.close()
  }
} finally {
  await browser?.close().catch(() => {})
  await stopVite(server)
}

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  conditions: {
    cpu4x: options.cpu4x,
    browser: 'Chrome channel via Playwright',
  },
  reports,
  consoleErrors,
}
console.log(JSON.stringify(result, null, 2))
if (
  reports.length !== VIEWPORTS.length
  || reports.some(({ report }) => report?.pageErrors?.length > 0 || report?.cases === undefined)
  || consoleErrors.length > 0
) {
  process.exitCode = 1
}
