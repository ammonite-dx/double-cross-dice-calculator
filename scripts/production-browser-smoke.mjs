import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const PRECOMPUTED_PREFIX = '/data/schema-v2/revision-1/'
const PREVIEW_HOST = '127.0.0.1'
const PREVIEW_START_TIMEOUT_MILLISECONDS = 30 * 1000
const PAGE_TIMEOUT_MILLISECONDS = 30 * 1000
const SETTLE_TIMEOUT_MILLISECONDS = 200

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function appendOutput(current, chunk) {
  const next = `${current}${chunk}`
  return next.length > 20_000 ? next.slice(-20_000) : next
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, PREVIEW_HOST, () => {
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

async function stopPreviewServer(server) {
  if (!server?.child) {
    return
  }
  const { child } = server
  if (child.exitCode === null && child.signalCode === null) {
    child.kill()
    await Promise.race([
      waitForChildExit(child),
      delay(5_000),
    ])
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await Promise.race([
      waitForChildExit(child),
      delay(1_000),
    ])
  }
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    if (!formatError(error).includes('Executable doesn\'t exist')) {
      throw error
    }
    return chromium.launch({
      channel: 'chrome',
      headless: true,
    })
  }
}

async function startPreviewServer() {
  const port = await getFreePort()
  const child = spawn(
    process.execPath,
    [
      VITE_BIN,
      'preview',
      '--host',
      PREVIEW_HOST,
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  let stderr = ''
  let spawnError = null
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout = appendOutput(stdout, chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr = appendOutput(stderr, chunk)
  })
  child.on('error', (error) => {
    spawnError = error
  })

  const baseUrl = `http://${PREVIEW_HOST}:${port}`
  const readinessUrl = `${baseUrl}/`
  const startedAt = Date.now()
  let lastFetchError = 'not attempted'
  const server = { child, baseUrl, port, stdout, stderr }

  try {
    while (Date.now() - startedAt < PREVIEW_START_TIMEOUT_MILLISECONDS) {
      if (spawnError) {
        throw spawnError
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `preview exited before readiness (code=${child.exitCode}, signal=${child.signalCode})`
        )
      }
      try {
        const response = await fetch(readinessUrl, {
          signal: AbortSignal.timeout(1_000),
        })
        if (response.ok) {
          return server
        }
        lastFetchError = `preview readiness returned HTTP ${response.status}`
      } catch (error) {
        lastFetchError = formatError(error)
      }
      await delay(100)
    }
    throw new Error(
      `preview did not become ready within ${PREVIEW_START_TIMEOUT_MILLISECONDS} ms`
    )
  } catch (error) {
    await stopPreviewServer(server)
    throw new Error([
      formatError(error),
      `last readiness fetch: ${lastFetchError}`,
      `preview exit: code=${child.exitCode}, signal=${child.signalCode}`,
      `preview stdout:\n${stdout.trim()}`,
      `preview stderr:\n${stderr.trim()}`,
    ].join('\n'), { cause: error })
  }
}

function createNetworkRecorder(page, baseUrl) {
  const origin = new URL(baseUrl).origin
  const record = {
    pageUrl: null,
    requests: [],
    responses: [],
    httpErrors: [],
    consoleMessages: [],
    pageErrors: [],
    requestFailures: [],
  }

  page.on('request', (request) => {
    const url = new URL(request.url())
    record.requests.push({
      method: request.method(),
      pathname: url.pathname,
      sameOrigin: url.origin === origin,
      url: request.url(),
    })
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    record.responses.push({
      sameOrigin: url.origin === origin,
      status: response.status(),
      url: response.url(),
    })
    if (url.origin === origin && response.status() >= 400) {
      record.httpErrors.push({
        pathname: url.pathname,
        status: response.status(),
        url: response.url(),
      })
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      record.consoleMessages.push({
        text: message.text(),
        type: message.type(),
      })
    }
  })
  page.on('pageerror', (error) => {
    record.pageErrors.push(formatError(error))
  })
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.origin === origin) {
      record.requestFailures.push({
        errorText: request.failure()?.errorText ?? 'unknown',
        url: request.url(),
      })
    }
  })
  return record
}

function getPrecomputedRequests(record) {
  return record.requests.filter((request) =>
    request.pathname.startsWith(PRECOMPUTED_PREFIX)
  )
}

function formatDiagnostics(record) {
  const precomputed = getPrecomputedRequests(record)
  const lines = [
    `page URL: ${record.pageUrl ?? 'unknown'}`,
    `precomputed requests: ${precomputed.map(({ url }) => url).join(', ') || 'none'}`,
    `same-origin HTTP errors: ${record.httpErrors.map(({ status, url }) => `${status} ${url}`).join(', ') || 'none'}`,
    `console warnings/errors: ${record.consoleMessages.map(({ type, text }) => `${type}: ${text}`).join(' | ') || 'none'}`,
    `page errors: ${record.pageErrors.join(' | ') || 'none'}`,
    `same-origin request failures: ${record.requestFailures.map(({ errorText, url }) => `${errorText} ${url}`).join(' | ') || 'none'}`,
  ]
  return lines.join('\n')
}

function enrichCaseError(caseId, error, record) {
  const message = formatError(error)
  if (message.startsWith(`[${caseId}]`)) {
    return error
  }
  return new Error(`[${caseId}] ${message}\n${formatDiagnostics(record)}`)
}

function assertCondition(caseId, condition, message) {
  if (!condition) {
    throw new Error(`[${caseId}] ${message}`)
  }
}

function assertNoBrowserErrors(caseId, record) {
  assertCondition(caseId, record.httpErrors.length === 0, 'same-origin HTTP error observed')
  assertCondition(caseId, record.consoleMessages.length === 0, 'browser console warning/error observed')
  assertCondition(caseId, record.pageErrors.length === 0, 'pageerror observed')
  assertCondition(caseId, record.requestFailures.length === 0, 'same-origin requestfailed observed')
}

function assertNoPrecomputedRequests(caseId, record) {
  const requests = getPrecomputedRequests(record)
  assertCondition(
    caseId,
    requests.length === 0,
    `unexpected revision-1 asset request (${requests.map(({ url }) => url).join(', ')})`,
  )
}

async function waitForCanvases(page, expectedCount, { exact = false } = {}) {
  await page.waitForFunction(
    ({ expectedCount: expected, exact: shouldBeExact }) => {
      const count = document.querySelectorAll('canvas').length
      return shouldBeExact ? count === expected : count >= expected
    },
    { expectedCount, exact },
    { timeout: PAGE_TIMEOUT_MILLISECONDS },
  )
  const canvases = page.locator('canvas')
  const actualCount = await canvases.count()
  for (let index = 0; index < Math.min(actualCount, expectedCount); index += 1) {
    await canvases.nth(index).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
  }
  return actualCount
}

async function navigateTo(page, record, baseUrl, path) {
  const response = await page.goto(`${baseUrl}${path}`, {
    timeout: PAGE_TIMEOUT_MILLISECONDS,
    waitUntil: 'domcontentloaded',
  })
  record.pageUrl = page.url()
  if (!response || response.status() >= 400) {
    throw new Error(`navigation failed for ${path} (status=${response?.status() ?? 'none'})`)
  }
}

async function settlePage(page) {
  await page.waitForTimeout(SETTLE_TIMEOUT_MILLISECONDS)
}

async function captureResultState(page) {
  return page.evaluate(() => ({
    tables: [...document.querySelectorAll('table')].map((table) =>
      table.textContent
    ),
    canvases: [...document.querySelectorAll('canvas')].map((canvas) =>
      canvas.toDataURL()
    ),
  }))
}

async function waitForResultCommit(page, previousState) {
  await page.waitForFunction(
    (previous) => {
      const currentTables = [...document.querySelectorAll('table')].map((table) =>
        table.textContent
      )
      const currentCanvases = [...document.querySelectorAll('canvas')].map((canvas) =>
        canvas.toDataURL()
      )
      return currentTables.some((text, index) => text !== previous.tables[index])
        || currentCanvases.some((data, index) => data !== previous.canvases[index])
    },
    previousState,
    { timeout: PAGE_TIMEOUT_MILLISECONDS },
  )
}

async function fillBoundaryInput(
  page,
  record,
  caseId,
  input,
  value,
  expectedCanvases,
) {
  assertCondition(
    caseId,
    await input.count() === 1,
    'accessible boundary input was not found',
  )
  const previousState = await captureResultState(page)
  await input.fill(String(value))
  assertCondition(
    caseId,
    await input.inputValue() === String(value),
    `boundary input did not retain ${value}`,
  )
  await waitForCanvases(page, expectedCanvases, { exact: true })
  await waitForResultCommit(page, previousState)
  assertNoBrowserErrors(caseId, record)
}

async function selectDisplayMode(page, record, caseId, label) {
  const select = page.locator('input[role="combobox"]')
  assertCondition(caseId, await select.count() === 1, 'display mode select was not found')
  const previousState = await captureResultState(page)
  await select.click({ force: true })
  await page.getByText(label, { exact: true }).click()
  await waitForCanvases(page, 1, { exact: true })
  await waitForResultCommit(page, previousState)
  assertNoBrowserErrors(caseId, record)
}

async function runCheck(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const record = createNetworkRecorder(page, baseUrl)
  try {
    await navigateTo(page, record, baseUrl, '/check')
    const canvases = await waitForCanvases(page, 1)
    await settlePage(page)
    assertNoPrecomputedRequests('check', record)
    assertNoBrowserErrors('check', record)

    await fillBoundaryInput(
      page,
      record,
      'check-dice=100',
      page.getByLabel('ダイス数'),
      100,
      1,
    )
    assertNoPrecomputedRequests('check-dice=100', record)
    const summaries = [
      { canvases, id: 'check', precomputed: 0 },
      { canvases: 1, id: 'check dice=100', precomputed: 0 },
    ]

    const opposedSwitch = page.getByLabel('対決判定')
    assertCondition('check opposed on', await opposedSwitch.count() === 1, 'opposed switch was not found')
    const opposedOnState = await captureResultState(page)
    await opposedSwitch.setChecked(true)
    await waitForCanvases(page, 1, { exact: true })
    await waitForResultCommit(page, opposedOnState)
    await page.getByText('リアクション側', { exact: true }).last().waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertNoBrowserErrors('check opposed on', record)
    summaries.push({ canvases: 1, id: 'check opposed on', precomputed: 0 })

    const opposedOffState = await captureResultState(page)
    await opposedSwitch.setChecked(false)
    await waitForCanvases(page, 1, { exact: true })
    await waitForResultCommit(page, opposedOffState)
    assertCondition(
      'check opposed off',
      await page.getByText('リアクション側', { exact: true }).count() === 0,
      'reaction UI remained visible after opposed mode was disabled',
    )
    assertNoBrowserErrors('check opposed off', record)
    summaries.push({ canvases: 1, id: 'check opposed off', precomputed: 0 })

    await selectDisplayMode(
      page,
      record,
      'check upper-tail',
      '達成値がX以上となる確率を表示',
    )
    summaries.push({ canvases: 1, id: 'check upper-tail', precomputed: 0 })
    await selectDisplayMode(
      page,
      record,
      'check PMF',
      '達成値がXとなる確率を表示',
    )
    summaries.push({ canvases: 1, id: 'check PMF', precomputed: 0 })

    await fillBoundaryInput(
      page,
      record,
      'check dice=99',
      page.getByLabel('ダイス数'),
      99,
      1,
    )
    await fillBoundaryInput(
      page,
      record,
      'check critical=2',
      page.getByLabel('クリティカル値'),
      2,
      1,
    )
    await fillBoundaryInput(
      page,
      record,
      'check 99D critical2 max=100',
      page.getByLabel('最大値'),
      100,
      1,
    )
    assertNoPrecomputedRequests('check 99D critical2', record)
    summaries.push({ canvases: 1, id: 'check 99D critical2 0..100', precomputed: 0 })

    const maxInput = page.getByLabel('最大値')
    assertCondition('check resource reject', await maxInput.count() === 1, 'maximum input was not found')
    await maxInput.fill('20000')
    assertCondition(
      'check resource reject',
      await maxInput.inputValue() === '20000',
      'maximum input did not retain 20000',
    )
    await page.getByRole('alert').filter({ hasText: '表示する点数が多すぎるため' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertNoBrowserErrors('check resource reject', record)
    summaries.push({ canvases: 0, id: 'check display 0..20000 rejected', precomputed: 0 })

    const recoveryState = await captureResultState(page)
    await maxInput.fill('100')
    assertCondition(
      'check resource recovery',
      await maxInput.inputValue() === '100',
      'maximum input did not retain 100',
    )
    await waitForCanvases(page, 1, { exact: true })
    await waitForResultCommit(page, recoveryState)
    assertCondition(
      'check resource recovery',
      await page.getByRole('alert').filter({ hasText: '表示する点数が多すぎるため' }).count() === 0,
      'display resource rejection remained after recovery',
    )
    assertNoBrowserErrors('check resource recovery', record)
    assertNoPrecomputedRequests('check resource recovery', record)
    summaries.push({ canvases: 1, id: 'check display 0..100 recovered', precomputed: 0 })

    assertNoPrecomputedRequests('check final', record)
    return summaries
  } catch (error) {
    throw enrichCaseError('check', error, record)
  } finally {
    await context.close().catch(() => {})
  }
}

async function runAttack(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const record = createNetworkRecorder(page, baseUrl)
  try {
    await navigateTo(page, record, baseUrl, '/attack')
    const initialCanvases = await waitForCanvases(page, 2, { exact: true })
    await settlePage(page)
    assertNoPrecomputedRequests('attack-initial', record)
    assertNoBrowserErrors('attack-initial', record)

    await fillBoundaryInput(
      page,
      record,
      'attack-d10',
      page.getByLabel('装甲・軽減値').first(),
      1,
      2,
    )
    assertNoPrecomputedRequests('attack-d10', record)
    assertNoBrowserErrors('attack-d10', record)
    await fillBoundaryInput(
      page,
      record,
      'attack-action-dice=100',
      page.getByLabel('ダイス数').first(),
      100,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack-damage-dice=100',
      page.getByLabel('攻撃力').first(),
      100,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack-defence-dice=100',
      page.getByLabel('装甲・軽減値').first(),
      100,
      2,
    )
    assertNoPrecomputedRequests('attack-boundaries', record)
    assertNoBrowserErrors('attack-boundaries', record)
    return [
      {
        canvases: initialCanvases,
        d10Requests: 0,
        id: 'attack defence=0',
        precomputed: 0,
      },
      {
        canvases: 2,
        d10Requests: 0,
        id: 'attack defence=1',
        precomputed: 0,
      },
      {
        canvases: 2,
        d10Requests: 0,
        id: 'attack action/attack/defence dice=100',
        precomputed: 0,
      },
    ]
  } catch (error) {
    throw enrichCaseError('attack', error, record)
  } finally {
    await context.close().catch(() => {})
  }
}

async function runBacktrack(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const record = createNetworkRecorder(page, baseUrl)
  try {
    await navigateTo(page, record, baseUrl, '/backtrack')
    const canvases = await waitForCanvases(page, 3, { exact: true })
    await settlePage(page)
    assertNoPrecomputedRequests('backtrack', record)
    assertNoBrowserErrors('backtrack', record)
    // Keep both high-dice changes across visible chart buckets so each input
    // update can be verified as an actual result commit.
    await fillBoundaryInput(
      page,
      record,
      'backtrack-encroachment=700',
      page.getByLabel('現在侵蝕率'),
      700,
      3,
    )
    await fillBoundaryInput(
      page,
      record,
      'backtrack-elois=100',
      page.getByLabel('Eロイス数'),
      100,
      3,
    )
    await fillBoundaryInput(
      page,
      record,
      'backtrack-dice=100',
      page.getByLabel('その他減少量'),
      100,
      3,
    )
    assertNoPrecomputedRequests('backtrack-boundaries', record)
    assertNoBrowserErrors('backtrack-boundaries', record)
    return [
      { canvases, id: 'backtrack', precomputed: 0 },
      { canvases: 3, id: 'backtrack Eロイス/other dice=100', precomputed: 0 },
    ]
  } catch (error) {
    throw enrichCaseError('backtrack', error, record)
  } finally {
    await context.close().catch(() => {})
  }
}

function printSummary(summaries) {
  console.log('production browser smoke: PASS')
  for (const summary of summaries) {
    console.log(summary.id)
    console.log(`  canvases: ${summary.canvases}`)
    console.log(`  precomputed requests: ${summary.precomputed}`)
    if (summary.d10Requests !== undefined) {
      console.log(`  d10 requests: ${summary.d10Requests}`)
    }
    if (summary.d10Status !== undefined) {
      console.log(`  d10 status: ${summary.d10Status}`)
    }
  }
  console.log('  console warnings/errors: 0')
  console.log('  same-origin HTTP errors: 0')
}

async function main() {
  let browser = null
  let server = null
  try {
    server = await startPreviewServer()
    browser = await launchChromium()
    const summaries = []
    summaries.push(...await runCheck(browser, server.baseUrl))
    summaries.push(...await runAttack(browser, server.baseUrl))
    summaries.push(...await runBacktrack(browser, server.baseUrl))
    printSummary(summaries)
  } finally {
    await browser?.close().catch(() => {})
    await stopPreviewServer(server)
  }
}

try {
  await main()
} catch (error) {
  console.error(`production browser smoke: FAIL\n${formatError(error)}`)
  process.exitCode = 1
}
