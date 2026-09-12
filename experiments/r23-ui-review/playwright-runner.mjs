import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { SCENARIOS, VIEWPORTS, validateScenarioDefinitions } from './scenarios.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const OUTPUT_DIRECTORY = fileURLToPath(new URL('./output/', import.meta.url))
const HOST = '127.0.0.1'
const PREVIEW_TIMEOUT_MS = 30_000
const PAGE_TIMEOUT_MS = 60_000
const STABLE_SAMPLE_INTERVAL_MS = 100
const REQUIRED_STABLE_SAMPLES = 2

function formatError(error) {
  return String(error?.stack ?? error)
}

function appendOutput(current, chunk) {
  const next = `${current}${chunk}`
  return next.length > 20_000 ? next.slice(-20_000) : next
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
      const port = typeof address === 'object' && address !== null ? address.port : null
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

async function stopPreviewServer(server) {
  if (!server?.child) {
    return
  }
  const { child } = server
  if (child.exitCode === null && child.signalCode === null) {
    child.kill()
    await Promise.race([waitForChildExit(child), delay(5_000)])
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await Promise.race([waitForChildExit(child), delay(1_000)])
  }
}

async function startPreviewServer() {
  const port = await getFreePort()
  const child = spawn(
    process.execPath,
    [VITE_BIN, 'preview', '--host', HOST, '--port', String(port), '--strictPort'],
    { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let output = ''
  let spawnError = null
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { output = appendOutput(output, chunk) })
  child.stderr.on('data', (chunk) => { output = appendOutput(output, chunk) })
  child.on('error', (error) => { spawnError = error })
  const baseUrl = `http://${HOST}:${port}`
  const startedAt = Date.now()
  let lastReadinessError = 'not attempted'
  const server = { child, baseUrl, port }
  try {
    while (Date.now() - startedAt < PREVIEW_TIMEOUT_MS) {
      if (spawnError) {
        throw spawnError
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`preview exited before readiness (code=${child.exitCode}, signal=${child.signalCode})`)
      }
      try {
        const response = await fetch(`${baseUrl}/`, {
          signal: AbortSignal.timeout(1_000),
        })
        if (response.ok) {
          return server
        }
        lastReadinessError = `HTTP ${response.status}`
      } catch (error) {
        lastReadinessError = formatError(error)
      }
      await delay(100)
    }
    throw new Error(`preview did not become ready within ${PREVIEW_TIMEOUT_MS} ms`)
  } catch (error) {
    await stopPreviewServer(server)
    throw new Error([
      formatError(error),
      `last readiness error: ${lastReadinessError}`,
      `preview output:\n${output.trim()}`,
    ].join('\n'), { cause: error })
  }
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    if (!formatError(error).includes('Executable doesn\'t exist')) {
      throw error
    }
    return chromium.launch({ channel: 'chrome', headless: true })
  }
}

function createDiagnostics(page, baseUrl) {
  const origin = new URL(baseUrl).origin
  const diagnostics = {
    consoleMessages: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: [],
  }
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      diagnostics.consoleMessages.push({ type: message.type(), text: message.text() })
    }
  })
  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(formatError(error))
  })
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.origin === origin) {
      diagnostics.requestFailures.push({
        errorText: request.failure()?.errorText ?? 'unknown',
        url: request.url(),
      })
    }
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin === origin && response.status() >= 400) {
      diagnostics.httpErrors.push({ status: response.status(), url: response.url() })
    }
  })
  return diagnostics
}

async function waitForCanvases(page, expectedCount) {
  await page.waitForFunction(
    (expected) => {
      const canvases = [...document.querySelectorAll('canvas')]
      return canvases.length === expected
        && canvases.every((canvas) => {
          const bounds = canvas.getBoundingClientRect()
          return bounds.width > 0 && bounds.height > 0
        })
    },
    expectedCount,
    { timeout: PAGE_TIMEOUT_MS },
  )
  const canvases = page.locator('canvas')
  for (let index = 0; index < expectedCount; index += 1) {
    await canvases.nth(index).waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
  }
}

async function getCanvasImages(page) {
  return page.evaluate(() => [...document.querySelectorAll('canvas')].map((canvas) => canvas.toDataURL()))
}

async function waitForStableCharts(page) {
  await page.evaluate(() => document.fonts?.ready)
  let previous = await getCanvasImages(page)
  let stableSamples = 0
  const maxSamples = Math.ceil(PAGE_TIMEOUT_MS / STABLE_SAMPLE_INTERVAL_MS)
  for (let sample = 0; sample < maxSamples; sample += 1) {
    await page.waitForTimeout(STABLE_SAMPLE_INTERVAL_MS)
    const current = await getCanvasImages(page)
    if (JSON.stringify(current) === JSON.stringify(previous)) {
      stableSamples += 1
      if (stableSamples >= REQUIRED_STABLE_SAMPLES) {
        return
      }
    } else {
      stableSamples = 0
      previous = current
    }
  }
  throw new Error('charts did not reach a stable frame before the timeout')
}

async function stubExternalFonts(page) {
  const fontStub = async (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  })
  await page.route('https://fonts.googleapis.com/**', fontStub)
  await page.route('https://fonts.gstatic.com/**', fontStub)
  return fontStub
}

async function executeStep(page, step) {
  if (step.type === 'select') {
    const select = page.getByRole('combobox', { name: step.label })
    await select.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await select.click({ force: true })
    await page.getByText(step.option, { exact: true }).click()
    return
  }
  if (step.type === 'click') {
    const button = page.getByRole(step.role, { name: step.name, exact: true })
    await button.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await button.click()
    return
  }
  if (step.type === 'fill') {
    let input
    if (step.target === 'attack-damage-value') {
      const damageDice = page.getByLabel('攻撃力（ダイス）').nth(step.comboIndex)
      const group = damageDice.locator(
        'xpath=ancestor::div[contains(@class,"v-row")][1]'
      )
      input = group.locator('input[type="number"]').nth(1)
    } else {
      input = page.getByLabel(step.label).nth(step.index)
    }
    await input.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await input.fill(String(step.value))
    const actualValue = await input.inputValue()
    if (actualValue !== String(step.value)) {
      throw new Error(
        `scenario fill did not stick (expected=${step.value}, actual=${actualValue})`
      )
    }
    return
  }
  throw new Error(`unsupported R23 scenario step: ${step.type}`)
}

function formatScenarioError(scenario, error, diagnostics) {
  return new Error([
    `[${scenario.id}] ${formatError(error)}`,
    `console warnings/errors: ${JSON.stringify(diagnostics.consoleMessages)}`,
    `page errors: ${JSON.stringify(diagnostics.pageErrors)}`,
    `request failures: ${JSON.stringify(diagnostics.requestFailures)}`,
    `HTTP errors: ${JSON.stringify(diagnostics.httpErrors)}`,
  ].join('\n'), { cause: error })
}

async function runScenario(browser, baseUrl, scenario) {
  const context = await browser.newContext({ viewport: VIEWPORTS[scenario.viewport] })
  const page = await context.newPage()
  const diagnostics = createDiagnostics(page, baseUrl)
  const fontStub = await stubExternalFonts(page)
  const screenshotPath = join(OUTPUT_DIRECTORY, scenario.screenshot)
  const startedAt = performance.now()
  try {
    const response = await page.goto(`${baseUrl}${scenario.route}`, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    })
    if (!response || response.status() >= 400) {
      throw new Error(`navigation failed (status=${response?.status() ?? 'none'})`)
    }
    await waitForCanvases(page, scenario.initialCanvases)
    for (const step of scenario.steps) {
      await executeStep(page, step)
    }
    await waitForCanvases(page, scenario.expectedCanvases)
    await waitForStableCharts(page)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    if (
      diagnostics.consoleMessages.length > 0
      || diagnostics.pageErrors.length > 0
      || diagnostics.requestFailures.length > 0
      || diagnostics.httpErrors.length > 0
    ) {
      throw new Error('browser diagnostics reported an error')
    }
    return {
      id: scenario.id,
      status: 'captured',
      screenshot: scenario.screenshot,
      canvases: scenario.expectedCanvases,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      diagnostics,
    }
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
    throw formatScenarioError(scenario, error, diagnostics)
  } finally {
    await page.unroute('https://fonts.googleapis.com/**', fontStub).catch(() => {})
    await page.unroute('https://fonts.gstatic.com/**', fontStub).catch(() => {})
    await context.close().catch(() => {})
  }
}

function parseArgs(args = process.argv.slice(2)) {
  const selected = args.find((argument) => argument.startsWith('--scenarios='))
  const unknown = args.filter((argument) => argument !== '--help' && argument !== '-h' && argument !== selected)
  if (unknown.length > 0) {
    throw new Error(`unknown argument: ${unknown[0]}`)
  }
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true, scenarioIds: null }
  }
  if (!selected) {
    return { help: false, scenarioIds: null }
  }
  const value = selected.slice('--scenarios='.length)
  const scenarioIds = value.split(',').map((id) => id.trim()).filter(Boolean)
  if (scenarioIds.length === 0) {
    throw new Error('--scenarios must contain at least one scenario id')
  }
  return { help: false, scenarioIds }
}

function printHelp() {
  console.log('Usage: node experiments/r23-ui-review/playwright-runner.mjs [--scenarios=id,id]')
  console.log('Captures the current production UI at the R23 desktop/mobile baseline viewports.')
}

const options = parseArgs()
if (options.help) {
  printHelp()
  process.exit(0)
}

const definitionErrors = validateScenarioDefinitions()
if (definitionErrors.length > 0) {
  throw new Error(definitionErrors.join('\n'))
}

const selectedScenarios = options.scenarioIds === null
  ? SCENARIOS
  : SCENARIOS.filter((scenario) => options.scenarioIds.includes(scenario.id))
if (selectedScenarios.length !== (options.scenarioIds?.length ?? selectedScenarios.length)) {
  const known = new Set(SCENARIOS.map((scenario) => scenario.id))
  const missing = options.scenarioIds.filter((id) => !known.has(id))
  throw new Error(`unknown R23 scenario id: ${missing.join(', ')}`)
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true })
let server = null
let browser = null
const results = []
try {
  server = await startPreviewServer()
  browser = await launchChromium()
  for (const scenario of selectedScenarios) {
    try {
      results.push(await runScenario(browser, server.baseUrl, scenario))
    } catch (error) {
      results.push({ id: scenario.id, status: 'failed', error: formatError(error) })
    }
  }
} finally {
  await browser?.close().catch(() => {})
  await stopPreviewServer(server)
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  scenarioCount: selectedScenarios.length,
  results,
}
await writeFile(join(OUTPUT_DIRECTORY, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (results.some((result) => result.status !== 'captured')) {
  process.exitCode = 1
}
