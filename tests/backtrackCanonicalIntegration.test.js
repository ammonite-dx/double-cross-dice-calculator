import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  createBacktrackCalculationRunner,
  createBacktrackCalculationSnapshot,
} from '../src/application/BacktrackCalculationRunner'
import {
  createCalculationFeedbackState,
  formatRangeFeedback,
} from '../src/application/CalculationFeedback'
import {
  CalculationRangeError,
} from '../src/application/CalculationClient'
import {
  ResourceGuardError,
  RESOURCE_GUARD_ERROR_CODES,
} from '../src/application/ResourceGuard'

const backtrackViewSource = readFileSync(
  new URL('../src/views/Backtrack.vue', import.meta.url),
  'utf8'
)
const inputPanelSource = readFileSync(
  new URL('../src/components/Backtrack/InputPanel.vue', import.meta.url),
  'utf8'
)
const chartPanelSource = readFileSync(
  new URL(
    '../src/components/Backtrack/FinalEncroachmentChartPanel.vue',
    import.meta.url
  ),
  'utf8'
)
const rangeNoticeSource = readFileSync(
  new URL('../src/components/RangePlanNotice.vue', import.meta.url),
  'utf8'
)

function createParams(overrides = {}) {
  return {
    encroachment: 100,
    lois: 7,
    elois: 0,
    dice: 0,
    value: 0,
    dlois: 'なし',
    ...overrides,
  }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createRunner({
  legacyResult = {
    single: [1, 2],
    double: [3, 4],
    second: [5, 6],
  },
  canonicalResult = { single: 'canonical-single' },
  createPresentation = vi.fn(() => ({
    version: 1,
    kind: 'backtrack-canonical-presentation',
    finalEncroachment: {
      single: [10, 20],
      double: [30, 40],
      second: [50, 60],
    },
  })),
  legacyCalculate = vi.fn(async () => legacyResult),
  canonicalCalculate = vi.fn(async () => canonicalResult),
  onError = vi.fn(),
} = {}) {
  const state = {
    finalEncroachment: { old: true },
    resultReady: true,
  }
  const feedback = createCalculationFeedbackState()
  const calculationClient = {
    calculateBacktrack: legacyCalculate,
    calculateBacktrackCanonical: canonicalCalculate,
  }
  const runner = createBacktrackCalculationRunner({
    state,
    feedback,
    calculationClient,
    createPresentation,
    onError,
  })
  return {
    runner,
    state,
    feedback,
    calculationClient,
    createPresentation,
    onError,
  }
}

describe('Backtrack canonical opt-in integration', () => {
  it('keeps the legacy API as the default and commits its existing payload', async () => {
    const legacyResult = {
      single: [1],
      double: [2],
      second: [3],
    }
    const setup = createRunner({ legacyResult })

    await expect(setup.runner.run({
      params: createParams(),
      canonicalOptIn: false,
    })).resolves.toBe(true)

    expect(setup.calculationClient.calculateBacktrack).toHaveBeenCalledOnce()
    expect(setup.calculationClient.calculateBacktrackCanonical)
      .not.toHaveBeenCalled()
    expect(setup.state.finalEncroachment).toBe(legacyResult)
    expect(setup.state.resultReady).toBe(true)
    expect(setup.feedback.status).toBe('ready')
  })

  it('uses canonical API once and commits only the adapter payload', async () => {
    const canonicalResult = {
      single: 'canonical-single',
      double: 'canonical-double',
      second: 'canonical-second',
    }
    const presentation = {
      version: 1,
      kind: 'backtrack-canonical-presentation',
      finalEncroachment: {
        single: [11, 22],
        double: [33, 44],
        second: [55, 66],
      },
    }
    const createPresentation = vi.fn(() => presentation)
    const setup = createRunner({ canonicalResult, createPresentation })
    const params = createParams({ dlois: '屍人' })

    await expect(setup.runner.run({
      params,
      canonicalOptIn: true,
    })).resolves.toBe(true)

    expect(setup.calculationClient.calculateBacktrackCanonical)
      .toHaveBeenCalledOnce()
    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(createPresentation).toHaveBeenCalledWith(
      canonicalResult,
      params
    )
    expect(setup.state.finalEncroachment)
      .toBe(presentation.finalEncroachment)
    expect(setup.state.finalEncroachment).not.toBe(canonicalResult)
    expect(setup.state.resultReady).toBe(true)
  })

  it('snapshots params and the mode without aliasing the validated draft', () => {
    const params = createParams()
    const snapshot = createBacktrackCalculationSnapshot({
      params,
      canonicalOptIn: true,
    })

    expect(snapshot.canonicalOptIn).toBe(true)
    expect(snapshot.params).not.toBe(params)
    params.encroachment = 999
    snapshot.params.value = 123

    expect(snapshot.params.encroachment).toBe(100)
    expect(params.value).toBe(0)
  })

  it('shares range-plan feedback and suppresses stale toggle/input results', async () => {
    const first = createDeferred()
    const second = createDeferred()
    const legacyCalculate = vi.fn(() => {
      return first.promise
    })
    const canonicalCalculate = vi.fn((_params, options) => {
      options.onRangePlan({ id: 'canonical-plan', accepted: true })
      return second.promise
    })
    const presentation = {
      finalEncroachment: {
        single: [1],
        double: [2],
        second: [3],
      },
    }
    const setup = createRunner({
      legacyCalculate,
      canonicalCalculate,
      createPresentation: vi.fn(() => presentation),
    })
    const firstParams = createParams({ encroachment: 90 })
    const secondParams = createParams({ encroachment: 110 })

    const firstRun = setup.runner.run({
      params: firstParams,
      canonicalOptIn: false,
    })
    const secondRun = setup.runner.run({
      params: secondParams,
      canonicalOptIn: true,
    })
    firstParams.encroachment = 999
    secondParams.encroachment = 998

    first.resolve({ stale: true })
    await expect(firstRun).resolves.toBe(false)
    expect(canonicalCalculate).toHaveBeenCalledWith(
      expect.objectContaining({ encroachment: 110 }),
      expect.any(Object)
    )
    expect(setup.feedback.plan).toEqual({
      id: 'canonical-plan',
      accepted: true,
    })

    second.resolve({ current: true })
    await expect(secondRun).resolves.toBe(true)
    expect(setup.state.finalEncroachment).toBe(presentation.finalEncroachment)
    expect(setup.state.finalEncroachment).not.toEqual({ stale: true })
  })

  it('clears the result on abort and dispose without allowing a late commit', async () => {
    const deferred = createDeferred()
    const setup = createRunner({
      canonicalCalculate: vi.fn(() => deferred.promise),
    })
    const controller = new AbortController()
    const request = setup.runner.run({
      params: createParams(),
      canonicalOptIn: true,
      signal: controller.signal,
    })

    expect(setup.state.finalEncroachment).toBeNull()
    controller.abort()
    await expect(request).resolves.toBe(false)
    expect(setup.feedback.status).toBe('idle')

    deferred.resolve({ late: true })
    await Promise.resolve()
    expect(setup.state.finalEncroachment).toBeNull()

    const secondDeferred = createDeferred()
    setup.calculationClient.calculateBacktrackCanonical
      .mockReturnValueOnce(secondDeferred.promise)
    const secondRequest = setup.runner.run({
      params: createParams({ value: 1 }),
      canonicalOptIn: true,
    })
    setup.runner.dispose()
    await expect(secondRequest).resolves.toBe(false)
    secondDeferred.resolve({ afterDispose: true })
    await Promise.resolve()
    expect(setup.state.finalEncroachment).toBeNull()
  })

  it('shows resource feedback, clears without fallback, and recovers on retry', async () => {
    const resourceError = new ResourceGuardError(
      RESOURCE_GUARD_ERROR_CODES.OVERSIZE,
      'resource rejected',
      {
        float64Bytes: 50 * 1024 * 1024,
        reservedBytes: 75 * 1024 * 1024,
        capacityBytes: 64 * 1024 * 1024,
      }
    )
    const canonicalResult = {
      single: 'canonical-single-after-retry',
      double: 'canonical-double-after-retry',
      second: 'canonical-second-after-retry',
    }
    const presentation = {
      version: 1,
      kind: 'backtrack-canonical-presentation',
      finalEncroachment: {
        single: [11, 22],
        double: [33, 44],
        second: [55, 66],
      },
    }
    const canonicalCalculate = vi.fn()
      .mockRejectedValueOnce(resourceError)
      .mockResolvedValueOnce(canonicalResult)
    const setup = createRunner({
      canonicalCalculate,
      createPresentation: vi.fn(() => presentation),
    })

    await expect(setup.runner.run({
      params: createParams(),
      canonicalOptIn: true,
    })).resolves.toBe(false)

    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(setup.state.finalEncroachment).toBeNull()
    expect(setup.state.resultReady).toBe(false)
    expect(setup.feedback.status).toBe('error')
    expect(setup.onError).toHaveBeenCalledWith(resourceError)

    const resourceDisplay = formatRangeFeedback(setup.feedback)
    expect(resourceDisplay).toMatchObject({
      type: 'error',
      title: '計算資源の制約により計算できません',
      action: '同時実行中の計算が終わるのを待つか、入力を小さくして再試行してください。',
    })
    expect(resourceDisplay.reasons).toContain(
      'この計算の予約量（75 MiB）が上限（64 MiB）を超えています。'
    )
    expect(rangeNoticeSource).toContain('formatRangeFeedback(props.feedback)')
    expect(rangeNoticeSource).toContain('v-if="display"')

    await expect(setup.runner.run({
      params: createParams({ encroachment: 105 }),
      canonicalOptIn: true,
    })).resolves.toBe(true)

    expect(canonicalCalculate).toHaveBeenCalledTimes(2)
    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(setup.createPresentation).toHaveBeenCalledWith(
      canonicalResult,
      createParams({ encroachment: 105 })
    )
    expect(setup.state.finalEncroachment)
      .toBe(presentation.finalEncroachment)
    expect(setup.state.resultReady).toBe(true)
    expect(setup.feedback.status).toBe('ready')
    expect(formatRangeFeedback(setup.feedback)).toBeNull()
  })

  it('keeps range rejection feedback distinct from ResourceGuardError', async () => {
    const plan = {
      accepted: false,
      rejectionReasons: ['estimated-memory'],
      warnings: [{ code: 'estimated-memory', severity: 'reject' }],
      estimates: { float64Bytes: 65 * 1024 * 1024 },
    }
    const rangeError = new CalculationRangeError(plan)
    const setup = createRunner({
      canonicalCalculate: vi.fn(async () => {
        throw rangeError
      }),
    })

    await expect(setup.runner.run({
      params: createParams(),
      canonicalOptIn: true,
    })).resolves.toBe(false)

    expect(setup.state.finalEncroachment).toBeNull()
    expect(setup.feedback.status).toBe('rejected')
    expect(formatRangeFeedback(setup.feedback)).toMatchObject({
      type: 'error',
      title: 'この入力では計算できません',
    })
    expect(formatRangeFeedback(setup.feedback).reasons).toContain(
      '計算に必要なメモリが大きくなっています。'
    )
  })

  it('keeps the existing chart panel and makes the temporary toggle controlled', () => {
    expect(backtrackViewSource).toContain('canonicalOptIn: false')
    expect(backtrackViewSource).toContain(
      'createBacktrackCalculationRunner'
    )
    expect(backtrackViewSource).toContain(
      '@canonical-toggle="onBacktrackCanonicalToggle"'
    )
    expect(backtrackViewSource).toContain('calculationRunner.dispose()')
    expect(inputPanelSource).toContain(
      "defineEmits(['validated', 'canonical-toggle'])"
    )
    expect(inputPanelSource).toContain(
      ':model-value="props.canonicalOptIn"'
    )
    expect(inputPanelSource).toContain(
      '@update:model-value="onCanonicalToggle"'
    )
    expect(inputPanelSource).not.toContain('calculateBacktrack')
    expect(chartPanelSource).toContain('<FinalEncroachmentChart')
    expect(chartPanelSource).not.toContain('ChartSetter')
  })
})
