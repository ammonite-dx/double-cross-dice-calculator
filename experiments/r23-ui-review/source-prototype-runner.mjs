import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { SCENARIOS, VIEWPORTS, validateScenarioDefinitions } from './scenarios.js'
import { getSourcePrototypeVariant } from './source-prototype-definitions.js'
import { withTemporarySourcePrototype } from './source-prototype-harness.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const OUTPUT_DIRECTORY = fileURLToPath(new URL('./output/source-prototypes/', import.meta.url))
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

async function stopChild(child) {
  if (!child) {
    return
  }
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
        const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(1_000) })
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
    await stopChild(child)
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

async function executeStep(page, step) {
  if (step.type === 'select') {
    const select = page.getByRole('combobox', { name: step.label })
    await select.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await select.click({ force: true })
    await page.getByText(step.option, { exact: true }).click()
    return
  }
  if (step.type === 'fill') {
    const input = page.getByLabel(step.label).nth(step.index)
    await input.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await input.fill(String(step.value))
    const actualValue = await input.inputValue()
    if (actualValue !== String(step.value)) {
      throw new Error(`scenario fill did not stick (expected=${step.value}, actual=${actualValue})`)
    }
    return
  }
  throw new Error(`unsupported source prototype scenario step: ${step.type}`)
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

async function collectAdvancedMetrics(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Number(box.x.toFixed(2)),
        y: Number(box.y.toFixed(2)),
        width: Number(box.width.toFixed(2)),
        height: Number(box.height.toFixed(2)),
        top: Number(box.top.toFixed(2)),
        right: Number(box.right.toFixed(2)),
        bottom: Number(box.bottom.toFixed(2)),
      }
    }
    const markerColumns = [...document.querySelectorAll('[data-r23-advanced-marker]')]
    const textRange = (element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const value = node.textContent ?? ''
        const start = value.indexOf('高度な設定')
        if (start < 0) continue
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + '高度な設定'.length)
        return { box: rect(range), element: node.parentElement ?? element }
      }
      return { box: null, element }
    }
    const controls = markerColumns.map((column) => {
      const selection = column.querySelector('.v-selection-control') ?? null
      const text = textRange(column)
      const inputWrapper = selection?.querySelector(
        '.v-selection-control__input, .v-selection-control__wrapper'
      ) ?? null
      const headerRow = selection?.closest('.v-row') ?? column.closest('.v-row')
      const selectionBox = rect(selection)
      const inputWrapperBox = rect(inputWrapper)
      const textBox = text.box
      const gap = inputWrapperBox && textBox ? textBox.x - inputWrapperBox.right : null
      const rowStyle = headerRow ? getComputedStyle(headerRow) : null
      const textStyle = getComputedStyle(text.element)
      return {
        selectionControl: selectionBox,
        inputWrapper: rect(inputWrapper),
        text: textBox,
        checkboxRightToTextLeft: gap === null ? null : Number(gap.toFixed(2)),
        headerRow: rect(headerRow),
        headerRowHeight: rowStyle ? Number.parseFloat(rowStyle.height) : null,
        textLineHeight: textStyle?.lineHeight ?? null,
        textCenterY: textBox ? Number((textBox.top + textBox.height / 2).toFixed(2)) : null,
        rowCenterY: headerRow ? Number((headerRow.getBoundingClientRect().top + headerRow.getBoundingClientRect().height / 2).toFixed(2)) : null,
      }
    })
    return {
      checkboxCount: controls.filter((control) => control.selectionControl !== null).length,
      textCount: markerColumns.length,
      controls,
      verticallyCentered: controls.map((control) => (
        control.textCenterY !== null
        && control.rowCenterY !== null
        && Math.abs(control.textCenterY - control.rowCenterY) <= 1
      )),
    }
  })
}

async function collectSettingMetrics(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Number(box.x.toFixed(2)),
        y: Number(box.y.toFixed(2)),
        width: Number(box.width.toFixed(2)),
        height: Number(box.height.toFixed(2)),
        top: Number(box.top.toFixed(2)),
        right: Number(box.right.toFixed(2)),
        bottom: Number(box.bottom.toFixed(2)),
      }
    }
    const findLabel = (text) => [...document.querySelectorAll('label')]
      .find((label) => label.textContent.trim() === text)
    const labels = ['最小値', '最大値', '表示モード']
    const fields = Object.fromEntries(labels.map((name) => {
      const label = findLabel(name)
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null
      const field = label?.closest('.v-input') ?? input?.closest('.v-input') ?? null
      const control = field?.querySelector('.v-input__control') ?? null
      const vField = field?.querySelector('.v-field') ?? null
      const vFieldField = field?.querySelector('.v-field__field') ?? null
      const vFieldInput = field?.querySelector('.v-field__input') ?? null
      const underline = field?.querySelector('.v-field__underlay, .v-field__outline') ?? null
      const nativeControl = field?.querySelector('input, [role="combobox"]') ?? null
      const fieldStyle = vField ? getComputedStyle(vField) : null
      const inputStyle = vFieldInput ? getComputedStyle(vFieldInput) : null
      const labelStyle = label ? getComputedStyle(label) : null
      return [name, {
        label: rect(label),
        input: rect(nativeControl),
        vInput: rect(field),
        inputControl: rect(control),
        field: rect(vField),
        fieldField: rect(vFieldField),
        fieldInput: rect(vFieldInput),
        underline: rect(underline),
        computed: {
          fieldHeight: fieldStyle?.height ?? null,
          fieldMinHeight: fieldStyle?.minHeight ?? null,
          inputPaddingTop: inputStyle?.paddingTop ?? null,
          inputPaddingBottom: inputStyle?.paddingBottom ?? null,
          inputLineHeight: inputStyle?.lineHeight ?? null,
          labelLineHeight: labelStyle?.lineHeight ?? null,
        },
      }]
    }))
    return { fields }
  })
}

async function collectCompoundMetrics(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Number(box.x.toFixed(2)),
        y: Number(box.y.toFixed(2)),
        width: Number(box.width.toFixed(2)),
        height: Number(box.height.toFixed(2)),
        top: Number(box.top.toFixed(2)),
        right: Number(box.right.toFixed(2)),
        bottom: Number(box.bottom.toFixed(2)),
      }
    }
    const group = document.querySelector('[role="group"][aria-labelledby]')
    const visualLabel = document.querySelector('.r23-other-reduction-group__label')
    const originalLabel = [...document.querySelectorAll('label')]
      .find((label) => label.textContent.trim() === 'その他減少量')
    const closestVuetifyColumn = (element) => {
      let current = element
      while (current && current !== document.body) {
        if ([...current.classList].some((name) => name === 'v-col' || name.startsWith('v-col-'))) {
          return current
        }
        current = current.parentElement
      }
      return null
    }
    const anchor = group ?? originalLabel
    const outerColumn = closestVuetifyColumn(anchor)
    const innerRow = group?.querySelector(':scope > .v-row')
      ?? originalLabel?.closest('.v-field')?.parentElement?.parentElement?.querySelector(':scope > .v-row')
      ?? null
    const outerRow = outerColumn?.parentElement ?? null
    const fields = [...(group ?? outerColumn ?? document).querySelectorAll('.v-input')]
      .filter((field) => closestVuetifyColumn(field) !== null && (closestVuetifyColumn(field) === outerColumn || group?.contains(field)))
      .slice(0, 2)
    const eLabel = [...document.querySelectorAll('label')]
      .find((label) => label.textContent.trim() === 'Eロイス数')
    const eField = eLabel?.closest('.v-input') ?? null
    return {
      group: rect(group),
      visualLabel: rect(visualLabel),
      outerColumn: rect(outerColumn),
      innerRow: rect(innerRow),
      fields: fields.map(rect),
      neighborElois: rect(eField),
      firstRow: rect(outerRow),
      groupName: group?.getAttribute('aria-labelledby')
        ? document.getElementById(group.getAttribute('aria-labelledby'))?.textContent.trim() ?? null
        : null,
    }
  })
}

async function validateAdvancedInteraction(page, expectedCount) {
  const advancedColumns = page.locator('[data-r23-advanced-marker]')
  const actualCount = await advancedColumns.count()
  if (actualCount !== expectedCount) {
    throw new Error(`advanced checkbox count mismatch (expected=${expectedCount}, actual=${actualCount})`)
  }
  const advancedField = page.getByLabel('《妖精の手》等の回数', { exact: true })
  for (let index = 0; index < actualCount; index += 1) {
    const control = advancedColumns.nth(index).locator('.v-selection-control').first()
    const clickTarget = control.locator('.v-selection-control__input').first()
    await clickTarget.click({ force: true })
    await advancedField.first().waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await clickTarget.click({ force: true })
    await advancedField.first().waitFor({ state: 'hidden', timeout: PAGE_TIMEOUT_MS })
  }
}

async function markAdvancedColumns(page) {
  return page.evaluate(() => {
    const columns = [...document.querySelectorAll('[class*="v-col-"]')]
      .filter((element) => element.textContent.trim() === '高度な設定')
    columns.forEach((column, index) => {
      column.setAttribute('data-r23-advanced-marker', String(index))
    })
    return columns.length
  })
}

async function validateCompoundAccessibility(page, fieldNames) {
  const group = page.getByRole('group', { name: 'その他減少量', exact: true })
  if (await group.count() !== 1) {
    throw new Error(`compound group count mismatch (expected=1, actual=${await group.count()})`)
  }
  for (const name of fieldNames) {
    const field = page.getByRole('spinbutton', { name, exact: true })
    const count = await field.count()
    if (count !== 1) {
      throw new Error(`compound field count mismatch for ${name} (expected=1, actual=${count})`)
    }
  }
}

async function runScenario(browser, baseUrl, scenario, variant, phase, outputDirectory) {
  const context = await browser.newContext({ viewport: VIEWPORTS[scenario.viewport] })
  const page = await context.newPage()
  const diagnostics = createDiagnostics(page, baseUrl)
  const fontStub = async (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  })
  await page.route('https://fonts.googleapis.com/**', fontStub)
  await page.route('https://fonts.gstatic.com/**', fontStub)
  const screenshotPath = join(outputDirectory, scenario.screenshot)
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
    let metrics = null
    if (variant.checks.type === 'advanced-checkbox') {
      const expected = variant.checks.expectedCheckboxesByRoute[scenario.route]
      const markerCount = await markAdvancedColumns(page)
      if (markerCount !== expected) {
        throw new Error(`advanced marker count mismatch (expected=${expected}, actual=${markerCount})`)
      }
      await validateAdvancedInteraction(page, expected)
      metrics = await collectAdvancedMetrics(page)
      if (metrics.checkboxCount !== expected || metrics.textCount < expected) {
        throw new Error(`advanced marker count mismatch (expected=${expected}, checkboxes=${metrics.checkboxCount}, texts=${metrics.textCount})`)
      }
    } else if (variant.checks.type === 'setting-geometry') {
      metrics = await collectSettingMetrics(page)
      if (Object.values(metrics.fields).some((field) => field.vInput === null)) {
        throw new Error('setting geometry metric is missing a v-input')
      }
    } else if (variant.checks.type === 'compound-label') {
      metrics = await collectCompoundMetrics(page)
      if (phase === 'candidate') {
        await validateCompoundAccessibility(page, variant.checks.fieldNames)
        if (metrics.groupName !== variant.checks.groupName) {
          throw new Error(`compound group label mismatch (expected=${variant.checks.groupName}, actual=${metrics.groupName})`)
        }
      }
    }
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
      phase,
      status: 'captured',
      screenshot: screenshotPath,
      metrics,
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

async function captureScenarios(variant, scenarios, phase, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true })
  let server = null
  let browser = null
  const results = []
  try {
    server = await startPreviewServer()
    browser = await launchChromium()
    for (const scenario of scenarios) {
      try {
        results.push(await runScenario(browser, server.baseUrl, scenario, variant, phase, outputDirectory))
      } catch (error) {
        results.push({ id: scenario.id, phase, status: 'failed', error: formatError(error) })
      }
    }
  } finally {
    await browser?.close().catch(() => {})
    await stopChild(server?.child)
  }
  return results
}

function compareMetricBoxes(baseline, candidate) {
  if (!baseline || !candidate) {
    return null
  }
  const result = {}
  for (const key of ['x', 'y', 'width', 'height', 'top', 'right', 'bottom']) {
    if (Number.isFinite(baseline[key]) && Number.isFinite(candidate[key])) {
      result[key] = Number((candidate[key] - baseline[key]).toFixed(2))
    }
  }
  return result
}

function compareMetrics(variant, baselineResults, candidateResults) {
  const baselineById = new Map(baselineResults.map((result) => [result.id, result]))
  return candidateResults.map((candidate) => {
    const baseline = baselineById.get(candidate.id)
    if (!baseline?.metrics || !candidate.metrics) {
      return { id: candidate.id, baseline: baseline?.status ?? 'missing', candidate: candidate.status }
    }
    if (variant.checks.type === 'advanced-checkbox') {
      return {
        id: candidate.id,
        headerRows: candidate.metrics.controls.map((control, index) => ({
          index,
          baseline: baseline.metrics.controls[index] ?? null,
          candidate: control,
        })),
      }
    }
    if (variant.checks.type === 'setting-geometry') {
      return {
        id: candidate.id,
        fields: Object.fromEntries(Object.entries(candidate.metrics.fields).map(([name, field]) => [name, {
          vInput: compareMetricBoxes(baseline.metrics.fields[name]?.vInput, field.vInput),
          field: compareMetricBoxes(baseline.metrics.fields[name]?.field, field.field),
          fieldInput: compareMetricBoxes(baseline.metrics.fields[name]?.fieldInput, field.fieldInput),
          underline: compareMetricBoxes(baseline.metrics.fields[name]?.underline, field.underline),
        }])),
      }
    }
    return {
      id: candidate.id,
      outerColumn: compareMetricBoxes(baseline.metrics.outerColumn, candidate.metrics.outerColumn),
      innerRow: compareMetricBoxes(baseline.metrics.innerRow, candidate.metrics.innerRow),
      visualLabel: candidate.metrics.visualLabel,
      firstRowHeightDelta: baseline.metrics.firstRow && candidate.metrics.firstRow
        ? Number((candidate.metrics.firstRow.height - baseline.metrics.firstRow.height).toFixed(2))
        : null,
      accessibility: {
        baselineGroup: baseline.metrics.groupName,
        candidateGroup: candidate.metrics.groupName,
      },
    }
  })
}

function parseArgs(args = process.argv.slice(2)) {
  let variantId = null
  let scenarioIds = null
  for (const argument of args) {
    if (argument === '--help' || argument === '-h') {
      return { help: true, variantId: null, scenarioIds: null }
    }
    if (argument.startsWith('--variant=')) {
      variantId = argument.slice('--variant='.length)
      continue
    }
    if (argument.startsWith('--scenarios=')) {
      scenarioIds = argument.slice('--scenarios='.length).split(',').map((id) => id.trim()).filter(Boolean)
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  if (variantId === null) {
    throw new Error('--variant=id is required')
  }
  if (scenarioIds !== null && scenarioIds.length === 0) {
    throw new Error('--scenarios must contain at least one scenario id')
  }
  return { help: false, variantId, scenarioIds }
}

function printHelp() {
  console.log('Usage: node experiments/r23-ui-review/source-prototype-runner.mjs --variant=id [--scenarios=id,id]')
  console.log('Variants: advanced-setting-inline-source, setting-form-comfortable-source, backtrack-compound-label-source')
  console.log('This runner temporarily edits Vue sources, builds, restores sources before capture, and never adopts a candidate.')
}

async function runBuild() {
  const isWindows = process.platform === 'win32'
  const command = isWindows ? process.env.ComSpec : 'npm'
  const args = isWindows
    ? ['/d', '/s', '/c', 'npm run build']
    : ['run', 'build']
  const child = spawn(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { output = appendOutput(output, chunk) })
  child.stderr.on('data', (chunk) => { output = appendOutput(output, chunk) })
  const [exitCode, signal] = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, closeSignal) => resolve([code, closeSignal]))
  })
  if (exitCode !== 0) {
    throw new Error(`npm run build failed (code=${exitCode}, signal=${signal})\n${output.trim()}`)
  }
  return { exitCode, signal, output }
}

const options = parseArgs()
if (options.help) {
  printHelp()
  process.exit(0)
}

const scenarioDefinitionErrors = validateScenarioDefinitions()
if (scenarioDefinitionErrors.length > 0) {
  throw new Error(scenarioDefinitionErrors.join('\n'))
}

const variant = getSourcePrototypeVariant(options.variantId)
const knownScenarios = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]))
const selectedScenarios = options.scenarioIds === null
  ? variant.scenarios.map((id) => knownScenarios.get(id))
  : options.scenarioIds.map((id) => knownScenarios.get(id)).filter(Boolean)
if (selectedScenarios.some((scenario) => !scenario)) {
  throw new Error(`unknown scenario for ${variant.id}`)
}
if (selectedScenarios.length !== (options.scenarioIds?.length ?? selectedScenarios.length)) {
  const missing = options.scenarioIds.filter((id) => !knownScenarios.has(id))
  throw new Error(`unknown scenario for ${variant.id}: ${missing.join(', ')}`)
}

const variantOutputDirectory = join(OUTPUT_DIRECTORY, variant.id)
const baselineDirectory = join(variantOutputDirectory, 'baseline')
const candidateDirectory = join(variantOutputDirectory, 'candidate')
await mkdir(variantOutputDirectory, { recursive: true })
const buildResults = []
const baselineBuildStartedAt = performance.now()
buildResults.push({
  phase: 'baseline',
  ...(await runBuild()),
  elapsedMs: Number((performance.now() - baselineBuildStartedAt).toFixed(1)),
})
const baselineResults = await captureScenarios(variant, selectedScenarios, 'baseline', baselineDirectory)
const candidateResults = await withTemporarySourcePrototype({
  root: ROOT,
  variantId: variant.id,
  build: async () => {
    const startedAt = performance.now()
    const result = await runBuild()
    buildResults.push({
      phase: 'candidate',
      ...result,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    })
  },
  capture: async () => captureScenarios(variant, selectedScenarios, 'candidate', candidateDirectory),
})

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  variant: variant.id,
  description: variant.description,
  viewportDefinitions: VIEWPORTS,
  sourceRestoredBeforeCapture: true,
  productionAdoption: 'none',
  buildResults,
  baseline: baselineResults,
  candidate: candidateResults,
  metricComparison: compareMetrics(variant, baselineResults, candidateResults),
  note: 'Review-only source prototype. Candidate source is restored byte-for-byte before Playwright capture; visual acceptance remains with the product owner.',
}
await writeFile(join(variantOutputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if ([...baselineResults, ...candidateResults].some((result) => result.status !== 'captured')) {
  process.exitCode = 1
}
