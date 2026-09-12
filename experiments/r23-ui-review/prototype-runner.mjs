import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import {
  applyBundleReplacement,
  validateBundleReplacementStats,
} from './bundle-replacement.mjs'
import { validateDomPreparationResult } from './prototype-contracts.mjs'
import { BACKTRACK_LABEL_STRESS_FIXTURES } from './backtrack-label-stress-fixtures.js'
import { SCENARIOS, VIEWPORTS, validateScenarioDefinitions } from './scenarios.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url))
const VARIANT_DIRECTORY = fileURLToPath(new URL('./variants/', import.meta.url))
const OUTPUT_DIRECTORY = fileURLToPath(new URL('./output/prototypes/', import.meta.url))
const HOST = '127.0.0.1'
const PREVIEW_TIMEOUT_MS = 30_000
const PAGE_TIMEOUT_MS = 60_000
const STABLE_SAMPLE_INTERVAL_MS = 100
const REQUIRED_STABLE_SAMPLES = 2

const BACKTRACK_NUMBER_FIELD_INDEX = Object.freeze({
  encroachment: 0,
  lois: 1,
  elois: 2,
  dice: 3,
  value: 4,
})

const BACKTRACK_LABEL_STRESS_SCENARIOS = Object.freeze(
  Object.values(BACKTRACK_LABEL_STRESS_FIXTURES).map((fixture) => Object.freeze({
    id: fixture.id,
    route: '/backtrack',
    viewport: 'mobile',
    screenshot: `${fixture.id}.png`,
    initialCanvases: 3,
    expectedCanvases: 3,
    steps: Object.freeze([
      ...Object.entries(fixture.params)
        .filter(([field]) => Object.hasOwn(BACKTRACK_NUMBER_FIELD_INDEX, field))
        .map(([field, value]) => Object.freeze({
          type: 'fill',
          target: 'backtrack-param',
          field,
          value,
        })),
      ...(fixture.params.dlois === 'なし'
        ? []
        : [Object.freeze({
            type: 'select',
            label: 'バックトラックに影響するDロイス',
            option: fixture.params.dlois,
          })]),
    ]),
  })),
)

const FOOTER_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'footer-flex-home-desktop',
    route: '/',
    viewport: 'desktop',
    screenshot: 'home-desktop.png',
    initialCanvases: 0,
    expectedCanvases: 0,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'footer-flex-home-mobile',
    route: '/',
    viewport: 'mobile',
    screenshot: 'home-mobile.png',
    initialCanvases: 0,
    expectedCanvases: 0,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'footer-flex-check-desktop',
    route: '/check',
    viewport: 'desktop',
    screenshot: 'check-desktop.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'footer-flex-backtrack-mobile',
    route: '/backtrack',
    viewport: 'mobile',
    screenshot: 'backtrack-mobile.png',
    initialCanvases: 3,
    expectedCanvases: 3,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'footer-flex-attack-desktop',
    route: '/attack',
    viewport: 'desktop',
    screenshot: 'attack-desktop.png',
    initialCanvases: 2,
    expectedCanvases: 2,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'footer-flex-attack-mobile',
    route: '/attack',
    viewport: 'mobile',
    screenshot: 'attack-mobile.png',
    initialCanvases: 2,
    expectedCanvases: 2,
    steps: Object.freeze([]),
  }),
  Object.freeze({
    id: 'footer-flex-drawer-desktop',
    route: '/check',
    viewport: 'desktop',
    screenshot: 'drawer-desktop.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([{ type: 'click-selector', selector: '.v-app-bar-nav-icon' }]),
  }),
  Object.freeze({
    id: 'footer-flex-drawer-mobile',
    route: '/check',
    viewport: 'mobile',
    screenshot: 'drawer-mobile.png',
    initialCanvases: 1,
    expectedCanvases: 1,
    steps: Object.freeze([{ type: 'click-selector', selector: '.v-app-bar-nav-icon' }]),
  }),
])

const VARIANTS = Object.freeze({
  'visual-parity': Object.freeze({
    bodyClass: 'r23-visual-parity',
    stylesheets: Object.freeze(['visual-parity.css']),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'check-desktop-ordinary'),
      SCENARIOS.find(({ id }) => id === 'check-mobile-ordinary'),
      SCENARIOS.find(({ id }) => id === 'attack-desktop-single'),
      SCENARIOS.find(({ id }) => id === 'attack-mobile-single'),
    ]),
  }),
  'backtrack-other-reduction-wide': Object.freeze({
    bodyClass: 'r23-backtrack-wide',
    stylesheets: Object.freeze(['backtrack-other-reduction-wide.css']),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile'),
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile-livingdead'),
    ]),
  }),
  'backtrack-other-reduction-stack': Object.freeze({
    bodyClass: 'r23-backtrack-stack',
    stylesheets: Object.freeze(['backtrack-other-reduction-stack.css']),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile'),
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile-livingdead'),
    ]),
  }),
  'footer-flex': Object.freeze({
    bodyClass: 'r23-footer-flex',
    stylesheets: Object.freeze(['footer-flex.css']),
    scenarios: FOOTER_SCENARIOS,
  }),
  'backtrack-label-6': Object.freeze({
    bodyClass: 'r23-backtrack-label-6',
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile'),
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile-livingdead'),
    ]),
    bundleReplacement: null,
  }),
  'backtrack-label-8': Object.freeze({
    bodyClass: 'r23-backtrack-label-8',
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile'),
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile-livingdead'),
    ]),
    bundleReplacement: Object.freeze({ from: 't?12:6', to: 't?12:8' }),
  }),
  'backtrack-label-9': Object.freeze({
    bodyClass: 'r23-backtrack-label-9',
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile'),
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile-livingdead'),
    ]),
    bundleReplacement: Object.freeze({ from: 't?12:6', to: 't?12:9' }),
  }),
  'backtrack-label-8-stress': Object.freeze({
    bodyClass: 'r23-backtrack-label-8',
    scenarios: BACKTRACK_LABEL_STRESS_SCENARIOS,
    bundleReplacement: Object.freeze({ from: 't?12:6', to: 't?12:8' }),
  }),
  'backtrack-label-9-stress': Object.freeze({
    bodyClass: 'r23-backtrack-label-9',
    scenarios: BACKTRACK_LABEL_STRESS_SCENARIOS,
    bundleReplacement: Object.freeze({ from: 't?12:6', to: 't?12:9' }),
  }),
  'backtrack-label-9-adaptive-stress': Object.freeze({
    bodyClass: 'r23-backtrack-label-9-adaptive',
    scenarios: BACKTRACK_LABEL_STRESS_SCENARIOS,
    bundleReplacement: Object.freeze({
      from: 't?12:6,weight:`bold`}}},textAlign:`center`,formatter:',
      to: 't?12:9,weight:`bold`}}},textAlign:`center`,anchor:(e)=>{let t=e.dataset.data[e.dataIndex];return t>=10&&t<15?`end`:`center`},align:(e)=>{let t=e.dataset.data[e.dataIndex];return t>=10&&t<15?`start`:`center`},offset:(e)=>{let t=e.dataset.data[e.dataIndex];return t>=10&&t<15?2:0},formatter:',
    }),
  }),
  'advanced-setting-parity': Object.freeze({
    bodyClass: 'r23-advanced-setting-parity',
    stylesheets: Object.freeze(['advanced-setting-parity.css']),
    domPreparation: Object.freeze({ advancedExpected: 1 }),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'check-desktop-ordinary'),
      SCENARIOS.find(({ id }) => id === 'check-mobile-ordinary'),
    ]),
  }),
  'setting-form-parity': Object.freeze({
    bodyClass: 'r23-setting-form-parity',
    stylesheets: Object.freeze(['setting-form-parity.css']),
    domPreparation: Object.freeze({
      settingExpectedByRoute: Object.freeze({ '/check': 1, '/attack': 2 }),
    }),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'check-desktop-ordinary'),
      SCENARIOS.find(({ id }) => id === 'check-mobile-ordinary'),
    ]),
  }),
  'scoped-visual-parity': Object.freeze({
    bodyClass: 'r23-scoped-visual-parity',
    stylesheets: Object.freeze([
      'advanced-setting-parity.css',
      'setting-form-parity.css',
    ]),
    domPreparation: Object.freeze({
      advancedExpectedByRoute: Object.freeze({ '/check': 1, '/attack': 2 }),
      settingExpectedByRoute: Object.freeze({ '/check': 1, '/attack': 2 }),
    }),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'check-desktop-ordinary'),
      SCENARIOS.find(({ id }) => id === 'check-mobile-ordinary'),
      SCENARIOS.find(({ id }) => id === 'attack-desktop-single'),
      SCENARIOS.find(({ id }) => id === 'attack-mobile-single'),
    ]),
  }),
  'backtrack-other-reduction-compound-label': Object.freeze({
    bodyClass: 'r23-backtrack-compound-label',
    stylesheets: Object.freeze(['backtrack-other-reduction-compound-label.css']),
    domPreparation: Object.freeze({ compoundExpected: 1 }),
    scenarios: Object.freeze([
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile'),
      SCENARIOS.find(({ id }) => id === 'backtrack-mobile-livingdead'),
    ]),
  }),
  'footer-short-baseline': Object.freeze({
    bodyClass: 'r23-footer-short-baseline',
    domPreparation: Object.freeze({ shortPage: true }),
    scenarios: Object.freeze([
      Object.freeze({
        id: 'footer-short-baseline-check-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'check-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([]),
      }),
      Object.freeze({
        id: 'footer-short-baseline-drawer-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'drawer-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([{ type: 'click-selector', selector: '.v-app-bar-nav-icon' }]),
      }),
    ]),
  }),
  'footer-short-flex': Object.freeze({
    bodyClass: 'r23-footer-flex',
    stylesheets: Object.freeze(['footer-flex.css']),
    domPreparation: Object.freeze({ shortPage: true }),
    scenarios: Object.freeze([
      Object.freeze({
        id: 'footer-short-flex-check-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'check-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([]),
      }),
      Object.freeze({
        id: 'footer-short-flex-drawer-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'drawer-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([{ type: 'click-selector', selector: '.v-app-bar-nav-icon' }]),
      }),
    ]),
  }),
  'footer-short-production': Object.freeze({
    bodyClass: 'r23-footer-production',
    domPreparation: Object.freeze({ shortPage: true }),
    scenarios: Object.freeze([
      Object.freeze({
        id: 'footer-short-production-check-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'check-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([]),
      }),
      Object.freeze({
        id: 'footer-short-production-drawer-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'drawer-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([{ type: 'click-selector', selector: '.v-app-bar-nav-icon' }]),
      }),
    ]),
  }),
  'footer-production-integrated': Object.freeze({
    bodyClass: 'r23-footer-production-integrated',
    domPreparation: Object.freeze({
      shortPageByScenario: Object.freeze({
        'footer-production-integrated-check-desktop': true,
        'footer-production-integrated-drawer-desktop': true,
      }),
    }),
    scenarios: Object.freeze([
      Object.freeze({
        id: 'footer-production-integrated-check-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'check-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([]),
      }),
      Object.freeze({
        id: 'footer-production-integrated-drawer-desktop',
        route: '/check',
        viewport: 'desktop',
        screenshot: 'drawer-desktop.png',
        initialCanvases: 1,
        expectedCanvases: 1,
        steps: Object.freeze([{ type: 'click-selector', selector: '.v-app-bar-nav-icon' }]),
      }),
      Object.freeze({
        id: 'footer-production-integrated-attack-mobile',
        route: '/attack',
        viewport: 'mobile',
        screenshot: 'attack-mobile.png',
        initialCanvases: 2,
        expectedCanvases: 2,
        steps: Object.freeze([]),
      }),
    ]),
  }),
})

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
  const server = { child, baseUrl, port }
  let lastReadinessError = 'not attempted'
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
  page.on('pageerror', (error) => { diagnostics.pageErrors.push(formatError(error)) })
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
    (expected) => [...document.querySelectorAll('canvas')].length === expected
      && [...document.querySelectorAll('canvas')].every((canvas) => {
        const bounds = canvas.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0
      }),
    expectedCount,
    { timeout: PAGE_TIMEOUT_MS },
  )
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
  if (step.type === 'click-selector') {
    const target = page.locator(step.selector).first()
    await target.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await target.click()
    if (step.selector === '.v-app-bar-nav-icon') {
      await page.locator('.v-navigation-drawer--active').first().waitFor({
        state: 'visible',
        timeout: PAGE_TIMEOUT_MS,
      })
      await page.waitForFunction(() => {
        const drawer = document.querySelector('.v-navigation-drawer--active')
        if (!drawer) return false
        const box = drawer.getBoundingClientRect()
        return box.left >= -1 && box.right > 0 && box.bottom > 0
      }, undefined, { timeout: PAGE_TIMEOUT_MS })
    }
    return
  }
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
      const damageDice = page.getByLabel('攻撃力').nth(step.comboIndex)
      const group = damageDice.locator('xpath=ancestor::div[contains(@class,"v-row")][1]')
      input = group.locator('input[type="number"]').nth(1)
    } else if (step.target === 'backtrack-param') {
      const index = BACKTRACK_NUMBER_FIELD_INDEX[step.field]
      if (index === undefined) {
        throw new Error(`unknown backtrack parameter field: ${step.field}`)
      }
      input = page.locator('.v-form').first().locator('input[type="number"]').nth(index)
    } else {
      input = page.getByLabel(step.label).nth(step.index)
    }
    await input.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS })
    await input.fill(String(step.value))
    const actualValue = await input.inputValue()
    if (actualValue !== String(step.value)) {
      throw new Error(`scenario fill did not stick (expected=${step.value}, actual=${actualValue})`)
    }
    return
  }
  throw new Error(`unsupported prototype scenario step: ${step.type}`)
}

async function prepareVariantDom(page, preparation = {}) {
  if (preparation === null || preparation === undefined) {
    return null
  }
  return page.evaluate((config) => {
    const exactTextNodes = (text) => [...document.querySelectorAll('body *')]
      .filter((element) => [...element.childNodes].some((node) => (
        node.nodeType === Node.TEXT_NODE && node.textContent.trim() === text
      )))
    const exactLabels = (text) => [...document.querySelectorAll('.v-label')]
      .filter((element) => element.textContent.trim() === text)
    const fail = (message) => {
      throw new Error(`R23 prototype DOM preparation failed: ${message}`)
    }

    const advancedControls = exactTextNodes('高度な設定')
      .filter((element) => element.querySelector('.v-checkbox-btn'))
    if (config.advancedExpected !== undefined) {
      if (advancedControls.length !== config.advancedExpected) {
        fail(`高度な設定 marker count expected ${config.advancedExpected}, got ${advancedControls.length}`)
      }
      advancedControls.forEach((element) => {
        element.classList.add('r23-advanced-setting-control')
        element.closest('.v-row')?.classList.add('r23-advanced-setting-row')
      })
    }

    const settingRows = [...document.querySelectorAll('.v-row')].filter((row) => {
      const labels = [...row.querySelectorAll('.v-label')]
        .map((label) => label.textContent.trim())
      return labels.length === 6
        && row.children.length === 3
        && ['最小値', '最大値', '表示モード'].every((text) => labels.includes(text))
    })
    if (config.settingExpected !== undefined) {
      if (settingRows.length !== config.settingExpected) {
        fail(`SettingForm group count expected ${config.settingExpected}, got ${settingRows.length}`)
      }
      settingRows.forEach((row) => row.classList.add('r23-setting-form-parity'))
    }

    const compoundRows = [...new Set(exactLabels('その他減少量')
      .map((label) => label.closest('.v-row'))
      .filter((row) => row !== null)
      .filter((row) => row.querySelectorAll(':scope > .v-col').length === 2))]
    if (config.compoundExpected !== undefined) {
      if (compoundRows.length !== config.compoundExpected) {
        fail(`compound label group count expected ${config.compoundExpected}, got ${compoundRows.length}`)
      }
      compoundRows.forEach((row) => {
        row.classList.add('r23-compound-label-row')
        const outer = row.parentElement
        if (!outer) {
          fail('compound label row has no outer group')
        }
        outer.classList.add('r23-compound-label')
        if (!outer.querySelector('.r23-compound-label-text')) {
          const visualLabel = document.createElement('div')
          visualLabel.className = 'r23-compound-label-text'
          visualLabel.setAttribute('aria-hidden', 'true')
          visualLabel.textContent = 'その他減少量'
          outer.insertBefore(visualLabel, row)
        }
        const inputs = [...row.querySelectorAll('input[type="number"]')]
        if (inputs.length !== 2) {
          fail(`compound label input count expected 2, got ${inputs.length}`)
        }
        inputs[0].removeAttribute('aria-labelledby')
        inputs[0].setAttribute('aria-label', 'その他減少量（ダイス）')
        inputs[1].removeAttribute('aria-labelledby')
        inputs[1].setAttribute('aria-label', 'その他減少量（固定値）')
        row.querySelectorAll('.v-field-label').forEach((label) => {
          label.classList.add('r23-compound-original-label')
        })
      })
    }

    if (config.shortPage) {
      const main = document.querySelector('.v-main')
      const content = [...(main?.children ?? [])]
        .filter((child) => !child.classList.contains('v-footer'))
      if (content.length === 0) {
        fail('short-page preparation could not find route content')
      }
      content.forEach((element) => {
        element.classList.add('r23-short-page-content')
        element.replaceChildren()
      })
    }

    return {
      advancedCount: advancedControls.length,
      settingGroupCount: settingRows.length,
      compoundGroupCount: compoundRows.length,
      shortPageContentCount: config.shortPage ? document.querySelectorAll('.r23-short-page-content').length : 0,
    }
  }, preparation)
}

function resolveDomPreparation(preparation, scenario) {
  if (preparation === undefined) {
    return undefined
  }
  const resolved = { ...preparation }
  for (const key of ['advancedExpected', 'settingExpected', 'compoundExpected']) {
    const byRoute = preparation[`${key}ByRoute`]
    if (byRoute !== undefined) {
      resolved[key] = byRoute[scenario.route]
    }
    delete resolved[`${key}ByRoute`]
  }
  if (preparation.shortPageByScenario !== undefined) {
    resolved.shortPage = preparation.shortPageByScenario[scenario.id] ?? false
    delete resolved.shortPageByScenario
  }
  return resolved
}

async function collectPrototypeMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight
    }
    const rect = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height, top: box.top, right: box.right, bottom: box.bottom }
    }
    const describeAncestors = (element) => {
      const items = []
      let current = element
      while (current && items.length < 24) {
        items.push({
          tagName: current.tagName,
          className: current.className,
          rect: rect(current),
        })
        current = current.parentElement
      }
      return items
    }
    const textElements = (text) => [...document.querySelectorAll('body *')]
      .filter((element) => visible(element) && element.textContent?.trim() === text)
      .sort((left, right) => left.children.length - right.children.length)
    const otherLabels = textElements('その他減少量')
    const otherLabel = otherLabels.find((element) => (
      !element.classList.contains('r23-compound-label-text')
    )) ?? null
    const compoundVisualLabel = otherLabels.find((element) => (
      element.classList.contains('r23-compound-label-text')
    )) ?? null
    const otherField = otherLabel?.closest('.v-field, .v-input') ?? null
    const otherGroup = otherField?.closest('.v-col') ?? null
    const otherOuterGroup = otherGroup?.parentElement?.parentElement ?? null
    const footer = document.querySelector('.v-footer')
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const footerBox = rect(footer)
    const footerBottomGap = footerBox === null ? null : viewport.height - footerBox.bottom
    const visibleDrawers = [...document.querySelectorAll('.v-navigation-drawer')]
      .filter(visible)
    const drawer = visibleDrawers[0] ?? null
    const drawerBox = rect(drawer)
    const drawerPoint = drawerBox === null
      ? null
      : document.elementFromPoint(
          drawerBox.x + drawerBox.width / 2,
          drawerBox.top + drawerBox.height / 2,
        )
    return {
      viewport,
      otherReduction: {
        label: rect(otherLabel),
        visualLabel: rect(compoundVisualLabel),
        field: rect(otherField),
        group: rect(otherGroup),
        nestedRow: rect(otherGroup?.parentElement),
        outerGroup: rect(otherOuterGroup),
        ancestors: describeAncestors(otherLabel),
        outerGroupStyle: otherOuterGroup
          ? {
              flex: getComputedStyle(otherOuterGroup).flex,
              flexBasis: getComputedStyle(otherOuterGroup).flexBasis,
              maxWidth: getComputedStyle(otherOuterGroup).maxWidth,
              width: getComputedStyle(otherOuterGroup).width,
            }
          : null,
        matchingGroupCount: document.querySelectorAll(
          '.v-main .v-row > .v-col:has(> .v-row)'
        ).length,
        allOuterGroupCount: document.querySelectorAll(
          '.v-main .v-col-md-3.v-col-6'
        ).length,
        nestedRowCount: document.querySelectorAll(
          '.v-main .v-col-md-3.v-col-6 > .v-row'
        ).length,
        labelScrollWidth: otherLabel?.scrollWidth ?? null,
        labelClientWidth: otherLabel?.clientWidth ?? null,
        clipped: otherLabel !== null && otherLabel.scrollWidth > otherLabel.clientWidth + 1,
      },
      footer: {
        box: footerBox,
        documentScrollHeight: document.documentElement.scrollHeight,
        bottomGap: footerBottomGap,
        atViewportBottom: footerBottomGap !== null && Math.abs(footerBottomGap) <= 1,
        position: footer ? getComputedStyle(footer).position : null,
      },
      drawer: {
        visibleCount: visibleDrawers.length,
        box: drawerBox,
        position: drawer ? getComputedStyle(drawer).position : null,
        zIndex: drawer ? getComputedStyle(drawer).zIndex : null,
        centerElementIsDrawer: drawerPoint?.closest('.v-navigation-drawer') === drawer,
      },
      main: (() => {
        const main = document.querySelector('.v-main')
        if (!main) return null
        const style = getComputedStyle(main)
        return {
          box: rect(main),
          display: style.display,
          flexDirection: style.flexDirection,
          minHeight: style.minHeight,
          children: [...main.children].map((child) => {
            const childStyle = getComputedStyle(child)
            return {
              tagName: child.tagName,
              className: child.className,
              box: rect(child),
              flex: childStyle.flex,
            }
          }),
        }
      })(),
      canvases: [...document.querySelectorAll('canvas')].map(rect),
    }
  })
}

function validateFooterPrototypeMetrics(metrics, variantId, scenarioId = '') {
  const footer = metrics?.footer
  if (!footer || footer.box === null) {
    throw new Error(`${variantId}: footer geometry is missing`)
  }
  if (variantId === 'footer-short-baseline' && !(footer.box.bottom < metrics.viewport.height)) {
    throw new Error(`${variantId}: synthetic baseline did not reproduce footer gap`)
  }
  if (variantId === 'footer-short-flex') {
    if (!Number.isFinite(footer.bottomGap) || Math.abs(footer.bottomGap) > 2) {
      throw new Error(`${variantId}: footer is not aligned to viewport bottom (gap=${footer.bottomGap})`)
    }
    if (footer.position === 'fixed' || footer.position === 'absolute') {
      throw new Error(`${variantId}: footer must remain in normal flow`)
    }
  }
  if (variantId === 'footer-short-production') {
    if (!Number.isFinite(footer.bottomGap) || Math.abs(footer.bottomGap) > 2) {
      throw new Error(`${variantId}: production footer is not aligned to viewport bottom (gap=${footer.bottomGap})`)
    }
    if (footer.position === 'fixed' || footer.position === 'absolute') {
      throw new Error(`${variantId}: production footer must remain in normal flow`)
    }
    const main = metrics.main
    if (!main || main.display !== 'flex' || main.flexDirection !== 'column') {
      throw new Error(`${variantId}: production main shell is not a column flex container`)
    }
  }
  if (variantId === 'footer-production-integrated') {
    if (footer.position === 'fixed' || footer.position === 'absolute') {
      throw new Error(`${variantId}: production footer must remain in normal flow`)
    }
    const main = metrics.main
    if (!main || main.display !== 'flex' || main.flexDirection !== 'column') {
      throw new Error(`${variantId}: production main shell is not a column flex container`)
    }
    const content = main.children.find((child) => (
      typeof child.className === 'string' && child.className.includes('main-area__content')
    ))
    if (!content?.box) {
      throw new Error(`${variantId}: production content shell geometry is missing`)
    }
    if (scenarioId.includes('-short-')) {
      if (!Number.isFinite(footer.bottomGap) || Math.abs(footer.bottomGap) > 2) {
        throw new Error(`${variantId}: short production footer is not aligned to viewport bottom (gap=${footer.bottomGap})`)
      }
      return
    }
    if (footer.box.top < content.box.bottom - 1 || footer.box.bottom < footer.box.top) {
      throw new Error(`${variantId}: long production footer does not follow content in normal flow`)
    }
  }
  if (metrics.drawer?.visibleCount > 0 && !metrics.drawer.centerElementIsDrawer) {
    throw new Error(`${variantId}: drawer does not stack above its center point`)
  }
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

async function preparePage(page, variant) {
  const patchStats = variant.bundleReplacement === null || variant.bundleReplacement === undefined
    ? null
    : {
        ...variant.bundleReplacement,
        responseCount: 0,
        replacementCount: 0,
        matchedResponseCount: 0,
        matchedResponseUrls: [],
      }
  if (variant.bundleReplacement === null || variant.bundleReplacement === undefined) {
    return patchStats
  }
  const { from, to } = variant.bundleReplacement
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    const replacement = applyBundleReplacement(body, { from, to })
    patchStats.responseCount += 1
    patchStats.replacementCount += replacement.replacementCount
    if (replacement.replacementCount > 0) {
      patchStats.matchedResponseCount += 1
      if (patchStats.matchedResponseUrls.length < 4) {
        patchStats.matchedResponseUrls.push(new URL(route.request().url()).pathname)
      }
    }
    await route.fulfill({ response, body: replacement.source })
  })
  return patchStats
}

async function runScenario(browser, baseUrl, scenario, variant, variantId, variantOutputDirectory) {
  const context = await browser.newContext({ viewport: VIEWPORTS[scenario.viewport] })
  const page = await context.newPage()
  const diagnostics = createDiagnostics(page, baseUrl)
  const screenshotPath = join(variantOutputDirectory, scenario.screenshot)
  const startedAt = performance.now()
  const domPreparationConfig = resolveDomPreparation(
    variant.domPreparation,
    scenario,
  )
  try {
    const patchStats = await preparePage(page, variant)
    const response = await page.goto(`${baseUrl}${scenario.route}`, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    })
    if (!response || response.status() >= 400) {
      throw new Error(`navigation failed (status=${response?.status() ?? 'none'})`)
    }
    await page.evaluate((className) => document.body.classList.add(className), variant.bodyClass)
    const stylesheets = variant.stylesheets
      ?? (variant.stylesheet === undefined ? [] : [variant.stylesheet])
    for (const stylesheet of stylesheets) {
      await page.addStyleTag({ path: join(VARIANT_DIRECTORY, stylesheet) })
    }
    await waitForCanvases(page, scenario.initialCanvases)
    validateBundleReplacementStats(patchStats, {
      variantId,
      scenarioId: scenario.id,
    })
    const domPreparation = domPreparationConfig === undefined
      ? null
      : validateDomPreparationResult(
          await prepareVariantDom(page, domPreparationConfig),
          domPreparationConfig,
          `${variantId} / ${scenario.id}`,
        )
    for (const step of scenario.steps) {
      await executeStep(page, step)
    }
    if (!domPreparationConfig?.shortPage) {
      await waitForCanvases(page, scenario.expectedCanvases)
    await waitForStableCharts(page)
    }
    const metrics = await collectPrototypeMetrics(page)
    if (variantId.startsWith('footer-')) {
      validateFooterPrototypeMetrics(metrics, variantId, scenario.id)
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
      status: 'captured',
      screenshot: screenshotPath,
      metrics,
      domPreparation,
      bundleReplacement: patchStats,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      diagnostics,
    }
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
    throw formatScenarioError(scenario, error, diagnostics)
  } finally {
    await page.unroute('**/*.js').catch(() => {})
    await context.close().catch(() => {})
  }
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
  if (!Object.hasOwn(VARIANTS, variantId)) {
    throw new Error(`unknown prototype variant: ${variantId}`)
  }
  if (scenarioIds !== null && scenarioIds.length === 0) {
    throw new Error('--scenarios must contain at least one scenario id')
  }
  return { help: false, variantId, scenarioIds }
}

function printHelp() {
  console.log('Usage: node experiments/r23-ui-review/prototype-runner.mjs --variant=id [--scenarios=id,id]')
  console.log(`Variants: ${Object.keys(VARIANTS).join(', ')}`)
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

const variant = VARIANTS[options.variantId]
const knownScenarios = new Map(variant.scenarios.map((scenario) => [scenario.id, scenario]))
const selectedScenarios = options.scenarioIds === null
  ? variant.scenarios
  : options.scenarioIds.map((id) => knownScenarios.get(id)).filter(Boolean)
if (selectedScenarios.length !== (options.scenarioIds?.length ?? selectedScenarios.length)) {
  const missing = options.scenarioIds.filter((id) => !knownScenarios.has(id))
  throw new Error(`unknown scenario for ${options.variantId}: ${missing.join(', ')}`)
}

const variantOutputDirectory = join(OUTPUT_DIRECTORY, options.variantId)
await mkdir(variantOutputDirectory, { recursive: true })
let server = null
let browser = null
const results = []
try {
  server = await startPreviewServer()
  browser = await launchChromium()
  for (const scenario of selectedScenarios) {
    try {
      results.push(await runScenario(
        browser,
        server.baseUrl,
        scenario,
        variant,
        options.variantId,
        variantOutputDirectory,
      ))
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
  variant: options.variantId,
  viewportDefinitions: VIEWPORTS,
  scenarioCount: selectedScenarios.length,
  results,
  note: 'Experiment-only prototype capture; no production CSS or chart source is changed.',
}
await writeFile(join(variantOutputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (results.some((result) => result.status !== 'captured')) {
  process.exitCode = 1
}
