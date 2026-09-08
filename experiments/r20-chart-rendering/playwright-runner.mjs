import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const VITE_CONFIG = fileURLToPath(new URL('./vite.config.mjs', import.meta.url))
const BENCHMARK_PATH = '/experiments/r20-chart-rendering/benchmark.html'
const HOST = '127.0.0.1'
const VITE_TIMEOUT_MS = 30_000
const BENCHMARK_TIMEOUT_MS = 10 * 60 * 1000

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
  const options = { iterations: 3, warmup: 1, budget: 512, cpu4x: false }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--cpu-4x') {
      options.cpu4x = true
      continue
    }
    const match = /^(--iterations|--warmup|--budget)=(\d+)$/.exec(argument)
    if (!match) {
      throw new Error(`Unknown argument: ${argument}`)
    }
    options[match[1].slice(2)] = Number(match[2])
  }
  return options
}

const options = parseArgs()
let server = null
let browser = null
try {
  server = await startVite()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  if (options.cpu4x) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  const query = new URLSearchParams({
    iterations: String(options.iterations),
    warmup: String(options.warmup),
    budget: String(options.budget),
  })
  await page.goto(`${server.baseUrl}${BENCHMARK_PATH}?${query}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => (
    window.__r20ChartRenderingResult !== undefined
    || window.__r20ChartRenderingError !== undefined
  ), { timeout: BENCHMARK_TIMEOUT_MS })
  const result = await page.evaluate(() => (
    window.__r20ChartRenderingResult ?? window.__r20ChartRenderingError
  ))
  console.log(JSON.stringify(result, null, 2))
  if (result.pageErrors?.length > 0 || result.cases === undefined) {
    process.exitCode = 1
  }
  await context.close()
} finally {
  await browser?.close().catch(() => {})
  await stopVite(server)
}
