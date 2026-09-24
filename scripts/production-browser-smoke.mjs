import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
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

async function assertDisplayRangeFormStyles(page, caseId, expectedCount) {
  await page.waitForFunction(
    (expected) => {
      const forms = [...document.querySelectorAll('.display-range-form')]
      return forms.length === expected
        && forms.every((form) => (
          (() => {
            const selection = form.querySelector('.v-select__selection')
            const selectionText = form.querySelector('.v-select__selection-text')
            const fieldInput = form.querySelector('.v-field__input')
            if (!selection || !selectionText || !fieldInput) {
              return false
            }
            const selectionStyle = getComputedStyle(selection)
            const selectionTextStyle = getComputedStyle(selectionText)
            const fieldInputStyle = getComputedStyle(fieldInput)
            return selectionStyle.marginBottom === '0px'
              // The inline-flex declaration is blockified to flex because the
              // selection text is a child of Vuetify's flex selection wrapper.
              && selectionTextStyle.display === 'flex'
              && selectionTextStyle.flexWrap === 'wrap'
              && selectionTextStyle.fontSize === '12px'
              && selectionTextStyle.alignContent === 'center'
              && fieldInputStyle.height === '40px'
          })()
        ))
    },
    expectedCount,
    { timeout: PAGE_TIMEOUT_MILLISECONDS },
  )

  const forms = page.locator('.display-range-form')
  assertCondition(
    caseId,
    await forms.count() === expectedCount,
    `expected ${expectedCount} display range forms`,
  )

  for (let index = 0; index < expectedCount; index += 1) {
    const styles = await forms.nth(index).evaluate((form) => {
      const readStyle = (selector, properties) => {
        const element = form.querySelector(selector)
        if (!element) {
          return null
        }
        const computed = getComputedStyle(element)
        return Object.fromEntries(
          properties.map((property) => [property, computed[property]]),
        )
      }
      const readAuthoredDisplay = () => {
        let display = null
        const visitRules = (rules) => {
          for (const rule of rules) {
            if (rule.selectorText === '.display-range-form .v-select__selection-text') {
              display = rule.style.display
            }
            if (rule.cssRules) {
              visitRules(rule.cssRules)
            }
          }
        }
        for (const sheet of document.styleSheets) {
          try {
            visitRules(sheet.cssRules)
          } catch {
            // Cross-origin font stylesheets cannot be inspected.
          }
        }
        return display
      }
      return {
        selection: readStyle('.v-select__selection', ['marginBottom']),
        selectionText: readStyle(
          '.v-select__selection-text',
          ['display', 'flexWrap', 'fontSize', 'alignContent'],
        ),
        selectionTextDisplayDeclaration: readAuthoredDisplay(),
        fieldInput: readStyle('.v-field__input', ['height']),
      }
    })

    const expectedStyles = [
      ['selection', 'marginBottom', '0px'],
      ['selectionText', 'display', 'flex'],
      ['selectionText', 'flexWrap', 'wrap'],
      ['selectionText', 'fontSize', '12px'],
      ['selectionText', 'alignContent', 'center'],
      ['fieldInput', 'height', '40px'],
    ]
    for (const [element, property, expected] of expectedStyles) {
      const actual = styles[element]?.[property] ?? 'missing'
      assertCondition(
        caseId,
        actual === expected,
        `form index ${index} ${element}.${property}: expected ${expected}, actual ${actual}`,
      )
    }
    assertCondition(
      caseId,
      styles.selectionTextDisplayDeclaration === 'inline-flex',
      `form index ${index} selectionText.display declaration: expected inline-flex, actual ${styles.selectionTextDisplayDeclaration ?? 'missing'}`,
    )
  }
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

async function beginCanvasIdentityTracking(page, caseId, expectedCount) {
  const result = await page.evaluate((expected) => {
    const trackerKey = '__dcdcCanvasIdentityTracker'
    window[trackerKey]?.observer?.disconnect()
    const canvases = [...document.querySelectorAll('canvas')]
    if (canvases.length !== expected) {
      return { count: canvases.length, expected }
    }

    const removed = new Set()
    const markRemovedNodes = (records) => {
      for (const record of records) {
        for (const removedNode of record.removedNodes) {
          canvases.forEach((canvas, index) => {
            if (
              removedNode === canvas
              || (removedNode instanceof Element && removedNode.contains(canvas))
            ) {
              removed.add(index)
            }
          })
        }
      }
    }
    const observer = new MutationObserver(markRemovedNodes)
    observer.observe(document.body, { childList: true, subtree: true })
    window[trackerKey] = { canvases, removed, observer, markRemovedNodes }
    return { count: canvases.length, expected }
  }, expectedCount)

  assertCondition(
    caseId,
    result.count === expectedCount,
    `expected ${expectedCount} canvases before tracking, found ${result.count}`,
  )
}

async function assertCanvasIdentityPreserved(page, caseId) {
  const result = await page.evaluate(() => {
    const trackerKey = '__dcdcCanvasIdentityTracker'
    const tracker = window[trackerKey]
    if (!tracker) {
      return { tracked: false, same: false, removed: [] }
    }
    tracker.markRemovedNodes(tracker.observer.takeRecords())
    const current = [...document.querySelectorAll('canvas')]
    const same = current.length === tracker.canvases.length
      && tracker.canvases.every((canvas, index) => current[index] === canvas)
    const removed = [...tracker.removed]
    tracker.observer.disconnect()
    delete window[trackerKey]
    return { tracked: true, same, removed }
  })

  assertCondition(caseId, result.tracked, 'canvas identity tracker was not initialized')
  assertCondition(
    caseId,
    result.same && result.removed.length === 0,
    `canvas node was replaced during recalculation (removed indices: ${result.removed.join(', ') || 'none'})`,
  )
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

async function installInitialSummaryTracking(page) {
  await page.addInitScript(() => {
    const state = {
      emptyCardObserved: false,
      emptyFootprintObserved: false,
      readyCardObserved: false,
      finished: false,
    }
    window.__dcdcInitialSummaryState = state

    const inspect = () => {
      const row = document.querySelector('.layout-footprint-row')
      const card = row?.querySelector('.v-card')
      if (card) {
        const table = card.querySelector('table')
        if (!table || table.querySelectorAll('tr').length === 0) {
          state.emptyCardObserved = true
        } else if (table.textContent?.trim()) {
          state.readyCardObserved = true
        }
      } else if (!state.readyCardObserved && row) {
        const rowHeight = row.getBoundingClientRect().height
        if (rowHeight > 0) state.emptyFootprintObserved = true
      }
    }

    const observe = () => {
      if (document.documentElement) {
        state.observer = new MutationObserver(inspect)
        state.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        })
      }
      const sample = () => {
        inspect()
        if (!state.finished) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }

    if (document.documentElement) observe()
    else document.addEventListener('DOMContentLoaded', observe, { once: true })
  })
}

async function assertInitialSummary(page, caseId) {
  const result = await page.evaluate(() => {
    const state = window.__dcdcInitialSummaryState
    if (state) {
      state.finished = true
      state.observer?.disconnect()
    }
    return state && {
      emptyCardObserved: state.emptyCardObserved,
      emptyFootprintObserved: state.emptyFootprintObserved,
      readyCardObserved: state.readyCardObserved,
    }
  })
  assertCondition(
    caseId,
    result !== null && result !== undefined,
    'initial summary tracker was not initialized',
  )
  assertCondition(
    caseId,
    !result.emptyCardObserved,
    'an empty summary card was rendered during initial calculation',
  )
  assertCondition(
    caseId,
    !result.emptyFootprintObserved,
    'an empty summary footprint was rendered during initial calculation',
  )
  assertCondition(
    caseId,
    result.readyCardObserved,
    'initial calculation did not render a ready summary card',
  )
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
      return currentTables.length !== previous.tables.length
        || currentCanvases.length !== previous.canvases.length
        || currentTables.some((text, index) => text !== previous.tables[index])
        || currentCanvases.some((data, index) => data !== previous.canvases[index])
    },
    previousState,
    { timeout: PAGE_TIMEOUT_MILLISECONDS },
  )
}

async function waitForCanvasCommit(page, previousState) {
  await page.waitForFunction(
    (previous) => {
      const currentCanvases = [...document.querySelectorAll('canvas')].map((canvas) =>
        canvas.toDataURL()
      )
      return currentCanvases.some((data, index) => data !== previous.canvases[index])
    },
    previousState,
    { timeout: PAGE_TIMEOUT_MILLISECONDS },
  )
}

async function assertAccessibleChartNames(page, caseId, expectedNames) {
  const chartRoles = page.locator('[role="img"][aria-label]')
  assertCondition(
    caseId,
    await chartRoles.count() === expectedNames.length,
    `expected ${expectedNames.length} named chart elements`,
  )
  const actualNames = await chartRoles.evaluateAll((elements) => (
    elements.map((element) => element.getAttribute('aria-label'))
  ))
  for (const name of expectedNames) {
    if (!actualNames.includes(name)) {
      throw new Error(
        `[${caseId}] missing accessible chart name: ${name} (actual: ${actualNames.join(', ')})`
      )
    }
  }
  const nestedRoles = await chartRoles.evaluateAll((elements) => (
    elements.filter((element) => element.querySelector('[role="img"]')).length
  ))
  assertCondition(
    caseId,
    nestedRoles === 0,
    'chart wrappers contain a duplicate descendant img role',
  )
}

async function assertFooterNormalFlow(page, caseId) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector('.main-area')
    const content = main?.querySelector('.main-area__content')
    const footer = main?.querySelector('.main-area__footer')

    if (!main || !content || !footer) {
      return null
    }

    const contentRect = content.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()
    const position = getComputedStyle(footer).position
    const followsContent = Boolean(
      content.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    )

    return {
      position,
      followsContent,
      followsAfterContent: footerRect.top >= contentRect.bottom - 1,
    }
  })

  assertCondition(caseId, layout !== null, 'main content or footer was not rendered')
  assertCondition(
    caseId,
    layout.position !== 'fixed' && layout.position !== 'absolute',
    `footer is positioned outside normal flow (${layout.position})`,
  )
  assertCondition(
    caseId,
    layout.followsContent && layout.followsAfterContent,
    'footer does not follow the main content in document flow',
  )
}

async function beginFooterContinuityTracking(page, caseId) {
  const baseline = await page.evaluate(() => {
    const main = document.querySelector('.main-area')
    const content = main?.querySelector('.main-area__content')
    const footer = main?.querySelector('.main-area__footer')
    const summaryRow = content?.querySelector('.layout-footprint-row')
    const originalSummaryCard = summaryRow?.querySelector('.v-card')
    const originalSummaryTable = originalSummaryCard?.querySelector('table')
    if (
      !content
      || !footer
      || !summaryRow
      || !originalSummaryCard
      || !originalSummaryTable
    ) {
      return null
    }

    const readLayout = () => {
      const footerRect = footer.getBoundingClientRect()
      const rowRect = summaryRow.getBoundingClientRect()
      return {
        footerDocumentTop: footerRect.top + window.scrollY,
        contentHeight: content.getBoundingClientRect().height,
        summaryRowHeight: rowRect.height,
      }
    }
    const samples = [readLayout()]
    const observer = new ResizeObserver(() => samples.push(readLayout()))
    observer.observe(content)
    observer.observe(footer)
    observer.observe(summaryRow)
    observer.observe(originalSummaryCard)
    observer.observe(originalSummaryTable)
    const summaryState = {
      originalText: originalSummaryTable.innerText,
      cardWasDisconnected: false,
      tableWasDisconnected: false,
      cardWasHidden: false,
      tableWasHidden: false,
      cardHadZeroHeight: false,
      tableHadZeroHeight: false,
      textChanged: false,
      sameNodesAfterCommit: false,
    }

    const isVisibleAndSized = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return element.isConnected
        && element.getClientRects().length > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && rect.height > 0
    }

    const nodeContains = (node, target) => node === target
      || (node instanceof Element && node.contains(target))

    const updateSummaryState = (mutationRecords = []) => {
      for (const mutation of mutationRecords) {
        for (const removedNode of mutation.removedNodes) {
          if (nodeContains(removedNode, originalSummaryCard)) {
            summaryState.cardWasDisconnected = true
          }
          if (nodeContains(removedNode, originalSummaryTable)) {
            summaryState.tableWasDisconnected = true
          }
        }
      }

      if (!originalSummaryCard.isConnected) {
        summaryState.cardWasDisconnected = true
      }
      if (!originalSummaryTable.isConnected) {
        summaryState.tableWasDisconnected = true
      }
      if (!isVisibleAndSized(originalSummaryCard)) {
        summaryState.cardWasHidden = true
        if (originalSummaryCard.getBoundingClientRect().height <= 0) {
          summaryState.cardHadZeroHeight = true
        }
      }
      if (!isVisibleAndSized(originalSummaryTable)) {
        summaryState.tableWasHidden = true
        if (originalSummaryTable.getBoundingClientRect().height <= 0) {
          summaryState.tableHadZeroHeight = true
        }
      }
      if (originalSummaryTable.innerText !== summaryState.originalText) {
        summaryState.textChanged = true
      }

      const currentSummaryCard = summaryRow.querySelector('.v-card')
      const currentSummaryTable = currentSummaryCard?.querySelector('table')
      if (
        currentSummaryCard === originalSummaryCard
        && currentSummaryTable === originalSummaryTable
      ) {
        summaryState.sameNodesAfterCommit = true
      }
    }
    const summaryObserver = new MutationObserver(updateSummaryState)
    summaryObserver.observe(content, {
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    let active = true
    let animationFrame = 0
    const sampleFrame = () => {
      if (!active) return
      samples.push(readLayout())
      updateSummaryState()
      animationFrame = requestAnimationFrame(sampleFrame)
    }
    animationFrame = requestAnimationFrame(sampleFrame)
    window.__dcdcFooterContinuityTracker = {
      baseline: samples[0],
      samples,
      observer,
      summaryObserver,
      summaryState,
      updateSummaryState,
      readLayout,
      stop: () => {
        active = false
        cancelAnimationFrame(animationFrame)
        observer.disconnect()
        summaryObserver.disconnect()
      },
    }
    return samples[0]
  })

  assertCondition(
    caseId,
    baseline !== null,
    'main content, footer, or summary footprint row was not rendered',
  )
  assertCondition(
    caseId,
    baseline.summaryRowHeight > 0,
    'ready summary footprint had no measurable height before input change',
  )
}

async function assertFooterContinuity(page, caseId) {
  await page.waitForFunction(
    () => {
      const tracker = window.__dcdcFooterContinuityTracker
      tracker?.updateSummaryState()
      return tracker?.summaryState.textChanged === true
        && tracker?.summaryState.sameNodesAfterCommit === true
    },
    undefined,
    { timeout: PAGE_TIMEOUT_MILLISECONDS },
  )

  const result = await page.evaluate(() => {
    const tracker = window.__dcdcFooterContinuityTracker
    if (!tracker) return null
    tracker.updateSummaryState()
    tracker.samples.push(tracker.readLayout())
    tracker.stop()
    delete window.__dcdcFooterContinuityTracker
    return {
      baseline: tracker.baseline,
      minimumFooterDocumentTop: Math.min(...tracker.samples.map(
        (sample) => sample.footerDocumentTop
      )),
      minimumContentHeight: Math.min(...tracker.samples.map(
        (sample) => sample.contentHeight
      )),
      minimumSummaryRowHeight: Math.min(...tracker.samples.map(
        (sample) => sample.summaryRowHeight
      )),
      cardWasDisconnected: tracker.summaryState.cardWasDisconnected,
      tableWasDisconnected: tracker.summaryState.tableWasDisconnected,
      cardWasHidden: tracker.summaryState.cardWasHidden,
      tableWasHidden: tracker.summaryState.tableWasHidden,
      cardHadZeroHeight: tracker.summaryState.cardHadZeroHeight,
      tableHadZeroHeight: tracker.summaryState.tableHadZeroHeight,
      summaryTextChanged: tracker.summaryState.textChanged,
      sameSummaryNodesAfterCommit: tracker.summaryState.sameNodesAfterCommit,
      sampleCount: tracker.samples.length,
    }
  })

  assertCondition(caseId, result !== null, 'footer continuity tracker was not initialized')
  assertCondition(
    caseId,
    result.sampleCount >= 2,
    `footer continuity tracker collected too few samples (${result.sampleCount})`,
  )
  assertCondition(
    caseId,
    !result.cardWasDisconnected && !result.tableWasDisconnected,
    'summary card or table node was disconnected during replacement',
  )
  assertCondition(
    caseId,
    !result.cardWasHidden && !result.tableWasHidden,
    'summary card or table became invisible during replacement',
  )
  assertCondition(
    caseId,
    !result.cardHadZeroHeight && !result.tableHadZeroHeight,
    'summary card or table had zero height during replacement',
  )
  assertCondition(
    caseId,
    result.summaryTextChanged && result.sameSummaryNodesAfterCommit,
    'the same summary card and table did not update to new ready content',
  )
  const tolerance = 1
  assertCondition(
    caseId,
    result.minimumFooterDocumentTop >= result.baseline.footerDocumentTop - tolerance,
    `footer moved upward during replacement (baseline=${result.baseline.footerDocumentTop}, minimum=${result.minimumFooterDocumentTop})`,
  )
  assertCondition(
    caseId,
    result.minimumContentHeight >= result.baseline.contentHeight - tolerance,
    `main content collapsed during replacement (baseline=${result.baseline.contentHeight}, minimum=${result.minimumContentHeight})`,
  )
  assertCondition(
    caseId,
    result.minimumSummaryRowHeight >= result.baseline.summaryRowHeight - tolerance,
    `summary layout footprint collapsed during replacement (baseline=${result.baseline.summaryRowHeight}, minimum=${result.minimumSummaryRowHeight})`,
  )
}

async function assertCompoundD10Groups(page, caseId, expectedGroups) {
  for (const { name, fieldNames, count } of expectedGroups) {
    const groups = page.getByRole('group', { name, exact: true })
    assertCondition(
      caseId,
      await groups.count() === count,
      `expected ${count} compound groups named ${name}`,
    )
    const ids = await groups.evaluateAll((elements) => (
      elements.map((element) => element.getAttribute('aria-labelledby'))
    ))
    assertCondition(
      caseId,
      ids.every((id) => typeof id === 'string' && id.length > 0)
        && new Set(ids).size === ids.length,
      `compound group IDs were empty or duplicated for ${name}`,
    )
    for (let index = 0; index < count; index += 1) {
      const group = groups.nth(index)
      const spinbuttons = group.getByRole('spinbutton')
      assertCondition(
        caseId,
        await spinbuttons.count() === fieldNames.length,
        `compound group ${name} did not expose ${fieldNames.length} spinbuttons`,
      )
      for (const fieldName of fieldNames) {
        assertCondition(
          caseId,
          await group.getByRole('spinbutton', { name: fieldName, exact: true }).count() === 1,
          `compound group ${name} did not expose ${fieldName}`,
        )
      }
    }
  }
}

async function selectAttackReactionMode(page, record, caseId, option, index = 0) {
  const select = page.getByRole('combobox', { name: '種別' }).nth(index)
  assertCondition(caseId, await select.count() === 1, 'reaction mode select was not found')
  const previousState = await captureResultState(page)
  await select.click({ force: true })
  await page.getByText(option, { exact: true }).click()
  await waitForCanvases(page, 2, { exact: true })
  await waitForResultCommit(page, previousState)
  assertNoBrowserErrors(caseId, record)
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

async function assertInvalidInput(page, record, caseId, input, value, message) {
  assertCondition(
    caseId,
    await input.count() === 1,
    'accessible validation input was not found',
  )
  await input.fill(String(value))
  assertCondition(
    caseId,
    await input.inputValue() === String(value),
    `validation input did not retain ${value}`,
  )
  await page.getByText(message, { exact: true }).first().waitFor({
    state: 'visible',
    timeout: PAGE_TIMEOUT_MILLISECONDS,
  })
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
  await installInitialSummaryTracking(page)
  const record = createNetworkRecorder(page, baseUrl)
  const fontStub = await stubExternalFonts(page)
  try {
    await navigateTo(page, record, baseUrl, '/check')
    const canvases = await waitForCanvases(page, 1)
    await settlePage(page)
    await assertInitialSummary(page, 'check initial summary')
    const displayForms = await assertDisplayRangeFormStyles(page, 'check display styles', 1)
    await assertAccessibleChartNames(page, 'check accessible chart name', [
      '一般判定 達成値確率分布',
    ])
    await assertFooterNormalFlow(page, 'check footer normal flow')
    assertNoPrecomputedRequests('check', record)
    assertNoBrowserErrors('check', record)

    await beginCanvasIdentityTracking(page, 'check chart transition', 1)
    await beginFooterContinuityTracking(page, 'check chart transition')
    await fillBoundaryInput(
      page,
      record,
      'check chart transition',
      page.getByLabel('ダイス数'),
      2,
      1,
    )
    await assertFooterContinuity(page, 'check chart transition')
    await assertCanvasIdentityPreserved(page, 'check chart transition')

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
      { canvases, displayForms, id: 'check', precomputed: 0 },
      {
        canvases: 1,
        id: 'check chart transition continuity',
        precomputed: 0,
        transitionContinuity: true,
        layoutContinuity: true,
      },
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

    await fillBoundaryInput(
      page,
      record,
      'check critical=11',
      page.getByLabel('クリティカル値'),
      11,
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
    await assertInvalidInput(
      page,
      record,
      'check critical=1 invalid',
      page.getByLabel('クリティカル値'),
      1,
      'クリティカル値は2以上として下さい。',
    )
    await fillBoundaryInput(
      page,
      record,
      'check critical=10 recovery',
      page.getByLabel('クリティカル値'),
      10,
      1,
    )
    await fillBoundaryInput(
      page,
      record,
      'check skill=-1',
      page.getByLabel('技能値'),
      -1,
      1,
    )
    await fillBoundaryInput(
      page,
      record,
      'check skill=0 recovery',
      page.getByLabel('技能値'),
      0,
      1,
    )

    const advancedSwitch = page.getByRole('checkbox', {
      name: '高度な設定',
      exact: true,
    })
    assertCondition('check advanced accessibility', await advancedSwitch.count() === 1, 'advanced settings checkbox was not accessible by name')
    await advancedSwitch.setChecked(true)
    const youseiInput = page.getByLabel('《妖精の手》等の回数')
    const shihaiInput = page.getByLabel('《支配の領域》の対象ダイス数')
    await fillBoundaryInput(page, record, 'check yousei=1', youseiInput, 1, 1)
    await assertInvalidInput(
      page,
      record,
      'check shihai=1 unsupported',
      shihaiInput,
      1,
      '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    )
    await fillBoundaryInput(page, record, 'check shihai=0 recovery', shihaiInput, 0, 1)
    const advancedOffState = await captureResultState(page)
    await advancedSwitch.setChecked(false)
    await waitForResultCommit(page, advancedOffState)
    assertCondition(
      'check advanced fields hidden',
      await youseiInput.isVisible() === false && await shihaiInput.isVisible() === false,
      'advanced score fields remained visible after disabling advanced settings',
    )
    await advancedSwitch.setChecked(true)
    await youseiInput.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MILLISECONDS })
    assertCondition(
      'check advanced hidden value reset',
      await youseiInput.inputValue() === '0' && await shihaiInput.inputValue() === '0',
      'advanced score fields were not reset when advanced settings were disabled',
    )
    await advancedSwitch.setChecked(false)
    assertNoBrowserErrors('check advanced off', record)

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

    // A rejected display request must not allow a later input edit to leave
    // the previous score summary visible. The new input remains pending until
    // the display window is made projectable again.
    await fillBoundaryInput(
      page,
      record,
      'check stale result invalidation',
      page.getByLabel('ダイス数'),
      2,
      0,
    )
    assertCondition(
      'check stale result invalidation',
      await page.locator('.v-card').filter({ hasText: 'サマリー' }).count() === 0,
      'stale score summary remained after input changed under a rejected display request',
    )
    assertNoBrowserErrors('check stale result invalidation', record)
    summaries.push({ canvases: 0, id: 'check stale result cleared', precomputed: 0 })

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

    // For a fixed difficulty, full-tail score metadata yields a bounded but
    // displayable success rate instead of the old unavailable dash.
    await fillBoundaryInput(
      page,
      record,
      'check fixed difficulty=10',
      page.getByLabel('難易度'),
      10,
      1,
    )
    await fillBoundaryInput(
      page,
      record,
      'check fixed difficulty dice=10',
      page.getByLabel('ダイス数'),
      10,
      1,
    )
    await fillBoundaryInput(
      page,
      record,
      'check fixed difficulty critical=7',
      page.getByLabel('クリティカル値'),
      7,
      1,
    )
    const checkSummaryRow = page
      .locator('.v-card')
      .filter({ hasText: 'サマリー' })
      .locator('tbody tr')
      .first()
    await checkSummaryRow.waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    const checkSummaryText = (await checkSummaryRow.textContent())?.replace(/\s+/g, ' ') ?? ''
    assertCondition(
      'check fixed difficulty summary',
      /99\.\d%/.test(checkSummaryText)
        && !checkSummaryText.includes('—'),
      `fixed-difficulty summary was unavailable: ${checkSummaryText}`,
    )
    assertNoBrowserErrors('check fixed difficulty summary', record)
    summaries.push({ canvases: 1, id: 'check fixed difficulty summary', precomputed: 0 })

    assertNoPrecomputedRequests('check final', record)
    return summaries
  } catch (error) {
    throw enrichCaseError('check', error, record)
  } finally {
    await page.unroute('https://fonts.googleapis.com/**', fontStub).catch(() => {})
    await page.unroute('https://fonts.gstatic.com/**', fontStub).catch(() => {})
    await context.close().catch(() => {})
  }
}

async function runAttack(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await installInitialSummaryTracking(page)
  const record = createNetworkRecorder(page, baseUrl)
  const fontStub = await stubExternalFonts(page)
  try {
    await navigateTo(page, record, baseUrl, '/attack')
    const initialCanvases = await waitForCanvases(page, 2, { exact: true })
    await settlePage(page)
    await assertInitialSummary(page, 'attack initial summary')
    const displayForms = await assertDisplayRangeFormStyles(page, 'attack display styles', 2)
    await assertAccessibleChartNames(page, 'attack accessible chart names', [
      '攻撃判定 達成値確率分布',
      '攻撃判定 ダメージ確率分布',
    ])
    await assertFooterNormalFlow(page, 'attack footer normal flow')
    const advancedCheckboxes = page.getByRole('checkbox', {
      name: '高度な設定',
      exact: true,
    })
    assertCondition(
      'attack advanced accessibility',
      await advancedCheckboxes.count() === 2,
      'initial action/reaction advanced settings checkboxes were not accessible by name',
    )
    assertNoPrecomputedRequests('attack-initial', record)
    assertNoBrowserErrors('attack-initial', record)
    await assertCompoundD10Groups(page, 'attack default dodge compound inputs', [
      {
        name: '攻撃力',
        fieldNames: ['攻撃力（ダイス）', '攻撃力（固定値）'],
        count: 1,
      },
      {
        name: '装甲・軽減値',
        fieldNames: ['装甲・軽減値（ダイス）', '装甲・軽減値（固定値）'],
        count: 1,
      },
    ])

    // Verify the R7 controller wiring for both sides of the first combo
    // before exercising the high-range boundary inputs below.
    await beginCanvasIdentityTracking(page, 'attack chart transition', 2)
    await beginFooterContinuityTracking(page, 'attack chart transition')
    await fillBoundaryInput(
      page,
      record,
      'attack action input update',
      page.getByLabel('ダイス数').first(),
      3,
      2,
    )
    await assertFooterContinuity(page, 'attack chart transition')
    await assertCanvasIdentityPreserved(page, 'attack chart transition')
    await selectAttackReactionMode(page, record, 'attack reaction mode update', '《イベイジョン》')
    await assertCompoundD10Groups(page, 'attack evasion compound inputs', [
      {
        name: '攻撃力',
        fieldNames: ['攻撃力（ダイス）', '攻撃力（固定値）'],
        count: 1,
      },
      {
        name: '装甲・軽減値',
        fieldNames: ['装甲・軽減値（ダイス）', '装甲・軽減値（固定値）'],
        count: 1,
      },
    ])
    await fillBoundaryInput(
      page,
      record,
      'attack reaction input update',
      page.getByLabel('技能値').nth(1),
      1,
      2,
    )

    const comboNameInputs = page.getByLabel('コンボ名')
    const addComboButton = page.getByRole('button', {
      name: 'コンボを追加',
      exact: true,
    })
    assertCondition(
      'attack combo add',
      await addComboButton.count() === 1,
      'combo add button was not found',
    )
    const addComboState = await captureResultState(page)
    await addComboButton.click()
    await comboNameInputs.nth(1).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    await waitForCanvases(page, 2, { exact: true })
    await waitForResultCommit(page, addComboState)
    await assertCompoundD10Groups(page, 'attack multi-combo compound inputs', [
      {
        name: '攻撃力',
        fieldNames: ['攻撃力（ダイス）', '攻撃力（固定値）'],
        count: 2,
      },
      {
        name: '装甲・軽減値',
        fieldNames: ['装甲・軽減値（ダイス）', '装甲・軽減値（固定値）'],
        count: 2,
      },
    ])
    assertCondition(
      'attack combo add',
      await comboNameInputs.nth(1).inputValue() === 'コンボ2',
      'new combo name did not appear',
    )
    await page.locator('tbody tr').filter({ hasText: 'コンボ2' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertNoBrowserErrors('attack combo add', record)

    await beginCanvasIdentityTracking(page, 'attack combo rename chart identity', 2)
    await comboNameInputs.nth(1).fill('検証コンボ')
    assertCondition(
      'attack combo rename',
      await comboNameInputs.nth(1).inputValue() === '検証コンボ',
      'renamed combo input did not retain its value',
    )
    await page.locator('tbody tr').filter({ hasText: '検証コンボ' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    await assertCanvasIdentityPreserved(page, 'attack combo rename chart identity')
    assertCondition(
      'attack combo rename',
      await page.locator('tbody tr').filter({ hasText: 'コンボ2' }).count() === 0,
      'old combo name remained in the summary',
    )
    assertNoBrowserErrors('attack combo rename', record)

    const duplicateButtons = page.getByRole('button', {
      name: '複製',
      exact: true,
    })
    assertCondition(
      'attack combo duplicate',
      await duplicateButtons.count() === 2,
      'expected two combo duplicate buttons after adding a combo',
    )
    const duplicateState = await captureResultState(page)
    await duplicateButtons.nth(1).click()
    await comboNameInputs.nth(2).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    await waitForCanvases(page, 2, { exact: true })
    await waitForResultCommit(page, duplicateState)
    assertCondition(
      'attack combo duplicate',
      await comboNameInputs.nth(2).inputValue() === '検証コンボのコピー',
      'duplicated combo name did not appear',
    )
    await page.locator('tbody tr').filter({ hasText: '検証コンボのコピー' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertNoBrowserErrors('attack combo duplicate', record)

    const removeButtons = page.getByRole('button', {
      name: '削除',
      exact: true,
    })
    assertCondition(
      'attack combo remove',
      await removeButtons.count() === 3,
      'expected three combo remove buttons before removing the duplicate',
    )
    const removeState = await captureResultState(page)
    await removeButtons.nth(2).click()
    await page.getByLabel('コンボ名').nth(2).waitFor({
      state: 'detached',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    await waitForCanvases(page, 2, { exact: true })
    await waitForResultCommit(page, removeState)
    await waitForCanvasCommit(page, removeState)
    assertCondition(
      'attack combo remove',
      await page.getByLabel('コンボ名').count() === 2,
      'duplicate combo inputs remained after removal',
    )
    assertCondition(
      'attack combo remove',
      await page.locator('tbody tr').filter({ hasText: '検証コンボのコピー' }).count() === 0,
      'duplicated combo remained in the summary after removal',
    )
    assertCondition(
      'attack combo remove',
      await page.getByLabel('コンボ名').nth(0).inputValue() === 'コンボ1'
        && await page.getByLabel('コンボ名').nth(1).inputValue() === '検証コンボ',
      'remaining combos are not in the expected order',
    )
    assertNoBrowserErrors('attack combo remove', record)

    const damagePanel = page.locator('.v-card').filter({ hasText: 'ダメージ分布' })
    const damageMaxInput = damagePanel.getByLabel('最大値')
    assertCondition(
      'attack display resource reject',
      await damageMaxInput.count() === 1,
      'damage maximum input was not found',
    )
    const resourceRejectState = await captureResultState(page)
    await damageMaxInput.fill('20000')
    assertCondition(
      'attack display resource reject',
      await damageMaxInput.inputValue() === '20000',
      'damage maximum input did not retain 20000',
    )
    await waitForResultCommit(page, resourceRejectState)
    await waitForCanvases(page, 0, { exact: true })
    await page.getByRole('alert').filter({ hasText: '表示する点数が多すぎるため' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertCondition(
      'attack display resource reject',
      await page.locator('.v-card').filter({ hasText: 'サマリー' }).count() === 0,
      'summary remained visible after display resource rejection',
    )
    assertNoPrecomputedRequests('attack display resource reject', record)
    assertNoBrowserErrors('attack display resource reject', record)

    const resourceRecoveryState = await captureResultState(page)
    await damageMaxInput.fill('100')
    assertCondition(
      'attack display resource recovery',
      await damageMaxInput.inputValue() === '100',
      'damage maximum input did not retain 100',
    )
    await waitForCanvases(page, 2, { exact: true })
    await waitForResultCommit(page, resourceRecoveryState)
    assertCondition(
      'attack display resource recovery',
      await page.getByRole('alert').filter({ hasText: '表示する点数が多すぎるため' }).count() === 0,
      'display resource rejection remained after recovery',
    )
    await page.locator('tbody tr').filter({ hasText: '合計' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertNoPrecomputedRequests('attack display resource recovery', record)
    assertNoBrowserErrors('attack display resource recovery', record)

    await fillBoundaryInput(
      page,
      record,
      'attack-d10',
      page.getByLabel('装甲・軽減値（ダイス）').first(),
      1,
      2,
    )
    assertNoPrecomputedRequests('attack-d10', record)
    assertNoBrowserErrors('attack-d10', record)
    const attackAdvancedSwitch = page.getByRole('checkbox', {
      name: '高度な設定',
      exact: true,
    }).first()
    await attackAdvancedSwitch.setChecked(true)
    await fillBoundaryInput(
      page,
      record,
      'attack critical=2',
      page.getByLabel('クリティカル値').first(),
      2,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack skill=-1',
      page.getByLabel('技能値').first(),
      -1,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack yousei=1',
      page.getByLabel('《妖精の手》等の回数').first(),
      1,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack kazanari=2',
      page.getByLabel('振り直せるダメージダイスの数').first(),
      2,
      2,
    )
    const attackAdvancedOffState = await captureResultState(page)
    await attackAdvancedSwitch.setChecked(false)
    await waitForResultCommit(page, attackAdvancedOffState)
    const attackYouseiInput = page.getByLabel('《妖精の手》等の回数').first()
    const attackShihaiInput = page.getByLabel('《支配の領域》の対象ダイス数').first()
    const attackKazanariInput = page.getByLabel('振り直せるダメージダイスの数').first()
    assertCondition(
      'attack advanced fields hidden',
      await attackYouseiInput.isVisible() === false
        && await attackShihaiInput.isVisible() === false
        && await attackKazanariInput.isVisible() === false,
      'attack advanced fields remained visible after disabling advanced settings',
    )
    await attackAdvancedSwitch.setChecked(true)
    await attackYouseiInput.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MILLISECONDS })
    assertCondition(
      'attack yousei/kazanari hidden value reset',
      await attackYouseiInput.inputValue() === '0'
        && await attackShihaiInput.inputValue() === '0'
        && await attackKazanariInput.inputValue() === '0',
      'attack yousei or kazanari was restored after re-enabling advanced settings',
    )
    await fillBoundaryInput(
      page,
      record,
      'attack shihai=1',
      attackShihaiInput,
      1,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack kazanari=3',
      attackKazanariInput,
      3,
      2,
    )
    const attackShihaiOffState = await captureResultState(page)
    await attackAdvancedSwitch.setChecked(false)
    await waitForResultCommit(page, attackShihaiOffState)
    await attackAdvancedSwitch.setChecked(true)
    await attackYouseiInput.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MILLISECONDS })
    assertCondition(
      'attack shihai/kazanari hidden value reset',
      await attackYouseiInput.inputValue() === '0'
        && await attackShihaiInput.inputValue() === '0'
        && await attackKazanariInput.inputValue() === '0',
      'attack shihai or kazanari was restored after re-enabling advanced settings',
    )
    await attackAdvancedSwitch.setChecked(false)
    await fillBoundaryInput(
      page,
      record,
      'attack critical=10 recovery',
      page.getByLabel('クリティカル値').first(),
      10,
      2,
    )
    await fillBoundaryInput(
      page,
      record,
      'attack skill=0 recovery',
      page.getByLabel('技能値').first(),
      0,
      2,
    )
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
      page.getByLabel('攻撃力（ダイス）').first(),
      100,
      2,
    )
    await selectAttackReactionMode(
      page,
      record,
      'attack guard mode update',
      'ガード・リアクション放棄',
      0,
    )
    await assertCompoundD10Groups(page, 'attack guard compound inputs', [
      {
        name: '攻撃力',
        fieldNames: ['攻撃力（ダイス）', '攻撃力（固定値）'],
        count: 2,
      },
      {
        name: 'ガード・装甲・軽減値',
        fieldNames: ['ガード・装甲・軽減値（ダイス）', 'ガード・装甲・軽減値（固定値）'],
        count: 1,
      },
      {
        name: '装甲・軽減値',
        fieldNames: ['装甲・軽減値（ダイス）', '装甲・軽減値（固定値）'],
        count: 1,
      },
    ])
    await fillBoundaryInput(
      page,
      record,
      'attack-defence-dice=100',
      page.getByLabel('ガード・装甲・軽減値（ダイス）').first(),
      100,
      2,
    )
    assertNoPrecomputedRequests('attack-boundaries', record)
    assertNoBrowserErrors('attack-boundaries', record)
    return [
      {
        canvases: initialCanvases,
        displayForms,
        d10Requests: 0,
        id: 'attack defence=0',
        precomputed: 0,
      },
      {
        canvases: 2,
        d10Requests: 0,
        id: 'attack chart transition continuity',
        precomputed: 0,
        transitionContinuity: true,
        layoutContinuity: true,
      },
      {
        canvases: 2,
        d10Requests: 0,
        id: 'attack combo rename chart identity',
        precomputed: 0,
        transitionContinuity: true,
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
      {
        canvases: 0,
        d10Requests: 0,
        id: 'attack display 0..20000 rejected',
        precomputed: 0,
      },
      {
        canvases: 2,
        d10Requests: 0,
        id: 'attack display 0..100 recovered',
        precomputed: 0,
      },
    ]
  } catch (error) {
    throw enrichCaseError('attack', error, record)
  } finally {
    await page.unroute('https://fonts.googleapis.com/**', fontStub).catch(() => {})
    await page.unroute('https://fonts.gstatic.com/**', fontStub).catch(() => {})
    await context.close().catch(() => {})
  }
}

async function runDisplayRangeStyleSmoke(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  const record = createNetworkRecorder(page, baseUrl)
  const fontStub = await stubExternalFonts(page)
  try {
    await navigateTo(page, record, baseUrl, '/check')
    await assertDisplayRangeFormStyles(page, 'mobile check display styles', 1)
    assertNoPrecomputedRequests('mobile check display styles', record)
    assertNoBrowserErrors('mobile check display styles', record)

    await navigateTo(page, record, baseUrl, '/attack')
    await assertDisplayRangeFormStyles(page, 'mobile attack display styles', 2)
    assertNoPrecomputedRequests('mobile attack display styles', record)
    assertNoBrowserErrors('mobile attack display styles', record)

    return [
      {
        canvases: 0,
        displayForms: 1,
        id: 'mobile check display styles',
        precomputed: 0,
      },
      {
        canvases: 0,
        displayForms: 2,
        id: 'mobile attack display styles',
        precomputed: 0,
      },
    ]
  } catch (error) {
    throw enrichCaseError('mobile display styles', error, record)
  } finally {
    await page.unroute('https://fonts.googleapis.com/**', fontStub).catch(() => {})
    await page.unroute('https://fonts.gstatic.com/**', fontStub).catch(() => {})
    await context.close().catch(() => {})
  }
}

async function runBacktrack(browser, baseUrl) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const record = createNetworkRecorder(page, baseUrl)
  const fontStub = await stubExternalFonts(page)
  try {
    await navigateTo(page, record, baseUrl, '/backtrack')
    const canvases = await waitForCanvases(page, 3, { exact: true })
    await settlePage(page)
    await assertAccessibleChartNames(page, 'backtrack accessible chart names', [
      '最終侵蝕率分布 一倍振り',
      '最終侵蝕率分布 二倍振り',
      '最終侵蝕率分布 二倍振りと追加振り',
    ])
    await assertFooterNormalFlow(page, 'backtrack footer normal flow')
    await assertCompoundD10Groups(page, 'backtrack other reduction compound inputs', [
      {
        name: 'その他減少量',
        fieldNames: ['その他減少量（ダイス）', 'その他減少量（固定値）'],
        count: 1,
      },
    ])
    assertNoPrecomputedRequests('backtrack', record)
    assertNoBrowserErrors('backtrack', record)
    // Keep both high-dice changes across visible chart buckets so each input
    // update can be verified as an actual result commit.
    await beginCanvasIdentityTracking(page, 'backtrack chart transition', 3)
    await fillBoundaryInput(
      page,
      record,
      'backtrack-encroachment=700',
      page.getByLabel('現在侵蝕率'),
      700,
      3,
    )
    await assertCanvasIdentityPreserved(page, 'backtrack chart transition')
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
      page.getByLabel('その他減少量（ダイス）'),
      100,
      3,
    )
    assertNoPrecomputedRequests('backtrack-boundaries', record)
    assertNoBrowserErrors('backtrack-boundaries', record)

    const backtrackDiceInput = page.getByLabel('その他減少量（ダイス）')
    await fillBoundaryInput(
      page,
      record,
      'backtrack resource rejection clears old frame',
      backtrackDiceInput,
      20000,
      0,
    )
    await page.getByRole('alert').filter({ hasText: 'この入力では計算できません' }).waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MILLISECONDS,
    })
    assertNoBrowserErrors('backtrack resource rejection clears old frame', record)

    const backtrackRecoveryState = await captureResultState(page)
    await fillBoundaryInput(
      page,
      record,
      'backtrack resource recovery',
      backtrackDiceInput,
      100,
      3,
    )
    await waitForResultCommit(page, backtrackRecoveryState)
    assertNoBrowserErrors('backtrack resource recovery', record)
    return [
      { canvases, id: 'backtrack', precomputed: 0 },
      { canvases: 3, id: 'backtrack Eロイス/other dice=100', precomputed: 0 },
      {
        canvases: 3,
        id: 'backtrack chart transition continuity',
        precomputed: 0,
        transitionContinuity: true,
      },
      { canvases: 0, id: 'backtrack resource rejection clears old frame', precomputed: 0 },
      { canvases: 3, id: 'backtrack resource recovery', precomputed: 0 },
    ]
  } catch (error) {
    throw enrichCaseError('backtrack', error, record)
  } finally {
    await page.unroute('https://fonts.googleapis.com/**', fontStub).catch(() => {})
    await page.unroute('https://fonts.gstatic.com/**', fontStub).catch(() => {})
    await context.close().catch(() => {})
  }
}

function printSummary(summaries) {
  console.log('production browser smoke: PASS')
  for (const summary of summaries) {
    console.log(summary.id)
    console.log(`  canvases: ${summary.canvases}`)
    if (summary.displayForms !== undefined) {
      console.log(`  display range forms: ${summary.displayForms}`)
    }
    console.log(`  precomputed requests: ${summary.precomputed}`)
    if (summary.transitionContinuity !== undefined) {
      console.log(`  chart node continuity: ${summary.transitionContinuity ? 'PASS' : 'FAIL'}`)
    }
    if (summary.layoutContinuity !== undefined) {
      console.log(`  summary/footer layout continuity: ${summary.layoutContinuity ? 'PASS' : 'FAIL'}`)
    }
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
    assertCondition(
      'production build assets',
      !existsSync(fileURLToPath(new URL('../dist/data/', import.meta.url))),
      'historical reference data was included in dist/data',
    )
    server = await startPreviewServer()
    browser = await launchChromium()
    const summaries = []
    summaries.push(...await runCheck(browser, server.baseUrl))
    summaries.push(...await runAttack(browser, server.baseUrl))
    summaries.push(...await runDisplayRangeStyleSmoke(browser, server.baseUrl))
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
