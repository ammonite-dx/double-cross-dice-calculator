import { describe, expect, it, vi } from 'vitest'

import {
  createBacktrackRunner,
} from '../src/features/backtrack/model/BacktrackCalculationRunner'
import {
  createBacktrackInputSnapshot,
} from '../src/features/backtrack/model/BacktrackInputSnapshot'
import {
  createCalculationFeedbackState,
} from '../src/runtime/CalculationFeedback'
import { formatRangeFeedback } from '../src/components/RangePlanNoticeFormatter'
import {
  CalculationRangeError,
} from '../src/runtime/CalculationClient'
import {
  ResourceGuardError,
  RESOURCE_GUARD_ERROR_CODES,
} from '../src/runtime/ResourceGuard'

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

function createPresentationFixture(overrides = {}) {
  return {
    version: 2,
    kind: 'backtrack-canonical-presentation',
    charts: {
      single: {
        key: 'single',
        labels: ['100%〜'],
        probabilities: [11, 22],
        backgroundColors: ['#EC1D2C'],
        title: '一倍振り',
        accessibleName: '最終侵蝕率分布 一倍振り',
      },
      double: {
        key: 'double',
        labels: ['失敗', '成功'],
        probabilities: [33, 44],
        backgroundColors: ['#EC1D2C', '#5EBB68'],
        title: '二倍振り',
        accessibleName: '最終侵蝕率分布 二倍振り',
      },
      second: {
        key: 'second',
        labels: ['失敗', '成功'],
        probabilities: [55, 66],
        backgroundColors: ['#EC1D2C', '#5EBB68'],
        title: '二倍振り+追加振り',
        accessibleName: '最終侵蝕率分布 二倍振りと追加振り',
      },
    },
    ...overrides,
  }
}

function createRunner({
  Result = {
    single: 'canonical-single',
    double: 'canonical-double',
    second: 'canonical-second',
  },
  createPresentation = vi.fn(() => createPresentationFixture()),
  Calculate = vi.fn(async () => Result),
  onError = vi.fn(),
} = {}) {
  const state = {
    presentation: { old: true },
    resultReady: true,
  }
  const feedback = createCalculationFeedbackState()
  const calculationClient = {
    calculateBacktrack: Calculate,
  }
  const runner = createBacktrackRunner({
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

describe('Backtrack canonical integration', () => {
  it('always uses the canonical API and commits only the adapter payload', async () => {
    const Result = {
      single: 'canonical-single',
      double: 'canonical-double',
      second: 'canonical-second',
    }
    const presentation = createPresentationFixture()
    const createPresentation = vi.fn(() => presentation)
    const setup = createRunner({ Result, createPresentation })
    const params = createParams({ dlois: '屍人' })

    await expect(setup.runner.run({params})).resolves.toBe(true)

    expect(setup.calculationClient.calculateBacktrack)
      .toHaveBeenCalledOnce()
    expect(setup.calculationClient.calculateBacktrack)
      .toHaveBeenCalledWith(
        params,
        expect.objectContaining({
          signal: expect.any(Object),
          onRangePlan: expect.any(Function),
        })
      )
    expect(createPresentation).toHaveBeenCalledWith(
      Result,
      params
    )
    expect(setup.state.presentation).toBe(presentation)
    expect(setup.state.presentation).not.toBe(Result)
    expect(setup.state.resultReady).toBe(true)
    expect(setup.feedback.status).toBe('ready')
  })

  it('snapshots only validated params without a temporary mode toggle', () => {
    const params = createParams()
    const snapshot = createBacktrackInputSnapshot({params})

    expect(snapshot).toEqual({params})
    expect(snapshot).not.toBe(params)
    expect(snapshot.params).not.toBe(params)
    expect(snapshot).not.toHaveProperty('OptIn')

    params.encroachment = 999
    snapshot.params.value = 123

    expect(snapshot.params.encroachment).toBe(100)
    expect(params.value).toBe(0)
  })

  it('shares range-plan feedback and suppresses stale results', async () => {
    const first = createDeferred()
    const second = createDeferred()
    const Calculate = vi.fn()
      .mockImplementationOnce((_params, options) => {
        options.onRangePlan({id: 'first-plan', accepted: true})
        return first.promise
      })
      .mockImplementationOnce((_params, options) => {
        options.onRangePlan({id: 'second-plan', accepted: true})
        return second.promise
      })
    const presentation = createPresentationFixture()
    const setup = createRunner({
      Calculate,
      createPresentation: vi.fn(() => presentation),
    })
    const firstParams = createParams({encroachment: 90})
    const secondParams = createParams({encroachment: 110})

    const firstRun = setup.runner.run({params: firstParams})
    const secondRun = setup.runner.run({params: secondParams})
    firstParams.encroachment = 999
    secondParams.encroachment = 998

    first.resolve({stale: true})
    await expect(firstRun).resolves.toBe(false)
    expect(Calculate).toHaveBeenCalledTimes(2)
    expect(Calculate).toHaveBeenLastCalledWith(
      expect.objectContaining({encroachment: 110}),
      expect.any(Object)
    )
    expect(setup.feedback.plan).toEqual({
      id: 'second-plan',
      accepted: true,
    })

    second.resolve({current: true})
    await expect(secondRun).resolves.toBe(true)
    expect(setup.state.presentation).toBe(presentation)
    expect(setup.state.presentation).not.toEqual({stale: true})
  })

  it('clears the result on abort and dispose without allowing a late commit', async () => {
    const deferred = createDeferred()
    const setup = createRunner({
      Calculate: vi.fn(() => deferred.promise),
    })
    const controller = new AbortController()
    const request = setup.runner.run({
      params: createParams(),
      signal: controller.signal,
    })

    expect(setup.state.presentation).toBeNull()
    controller.abort()
    await expect(request).resolves.toBe(false)
    expect(setup.feedback.status).toBe('idle')

    deferred.resolve({late: true})
    await Promise.resolve()
    expect(setup.state.presentation).toBeNull()

    const secondDeferred = createDeferred()
    setup.calculationClient.calculateBacktrack
      .mockReturnValueOnce(secondDeferred.promise)
    const secondRequest = setup.runner.run({
      params: createParams({value: 1}),
    })
    setup.runner.dispose()
    await expect(secondRequest).resolves.toBe(false)
    secondDeferred.resolve({afterDispose: true})
    await Promise.resolve()
    expect(setup.state.presentation).toBeNull()
  })

  it('shows resource rejection, clears without fallback, and recovers on retry', async () => {
    const resourceError = new ResourceGuardError(
      RESOURCE_GUARD_ERROR_CODES.OVERSIZE,
      'resource rejected',
      {
        float64Bytes: 50 * 1024 * 1024,
        reservedBytes: 75 * 1024 * 1024,
        capacityBytes: 64 * 1024 * 1024,
      }
    )
    const Result = {
      single: 'canonical-single-after-retry',
      double: 'canonical-double-after-retry',
      second: 'canonical-second-after-retry',
    }
    const presentation = createPresentationFixture()
    const Calculate = vi.fn()
      .mockRejectedValueOnce(resourceError)
      .mockResolvedValueOnce(Result)
    const setup = createRunner({
      Calculate,
      createPresentation: vi.fn(() => presentation),
    })

    await expect(setup.runner.run({params: createParams()}))
      .resolves.toBe(false)

    expect(setup.calculationClient.calculateBacktrack).toHaveBeenCalledOnce()
    expect(setup.state.presentation).toBeNull()
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
    await expect(setup.runner.run({
      params: createParams({encroachment: 105}),
    })).resolves.toBe(true)

    expect(Calculate).toHaveBeenCalledTimes(2)
    expect(setup.calculationClient.calculateBacktrack).toHaveBeenCalledTimes(2)
    expect(setup.state.presentation).toBe(presentation)
    expect(setup.feedback.status).toBe('ready')
    expect(formatRangeFeedback(setup.feedback)).toBeNull()
  })

  it('clears presentation errors without fallback and commits on retry', async () => {
    const presentationError = new Error('presentation failed')
    const presentation = createPresentationFixture()
    const createPresentation = vi.fn()
      .mockImplementationOnce(() => {
        throw presentationError
      })
      .mockReturnValueOnce(presentation)
    const Calculate = vi.fn()
      .mockResolvedValue({canonical: true})
    const setup = createRunner({Calculate, createPresentation})

    await expect(setup.runner.run({params: createParams()}))
      .resolves.toBe(false)

    expect(setup.calculationClient.calculateBacktrack).toHaveBeenCalledOnce()
    expect(setup.state.presentation).toBeNull()
    expect(setup.state.resultReady).toBe(false)
    expect(setup.feedback.status).toBe('error')
    expect(setup.onError).toHaveBeenCalledWith(presentationError)
    expect(formatRangeFeedback(setup.feedback)).toMatchObject({
      type: 'error',
      title: '計算に失敗しました',
    })

    await expect(setup.runner.run({
      params: createParams({encroachment: 105}),
    })).resolves.toBe(true)

    expect(Calculate).toHaveBeenCalledTimes(2)
    expect(createPresentation).toHaveBeenCalledTimes(2)
    expect(setup.calculationClient.calculateBacktrack).toHaveBeenCalledTimes(2)
    expect(setup.state.presentation).toBe(presentation)
    expect(setup.state.resultReady).toBe(true)
    expect(setup.feedback.status).toBe('ready')
    expect(formatRangeFeedback(setup.feedback)).toBeNull()
  })

  it('keeps range rejection distinct and clears the canonical result', async () => {
    const plan = {
      accepted: false,
      rejectionReasons: ['estimated-memory'],
      warnings: [{code: 'estimated-memory', severity: 'reject'}],
      estimates: {float64Bytes: 65 * 1024 * 1024},
    }
    const rangeError = new CalculationRangeError(plan)
    const setup = createRunner({
      Calculate: vi.fn(async () => {
        throw rangeError
      }),
    })

    await expect(setup.runner.run({params: createParams()}))
      .resolves.toBe(false)

    expect(setup.state.presentation).toBeNull()
    expect(setup.feedback.status).toBe('rejected')
    expect(formatRangeFeedback(setup.feedback)).toMatchObject({
      type: 'error',
      title: 'この入力では計算できません',
    })
    expect(formatRangeFeedback(setup.feedback).reasons).toContain(
      '計算に必要なメモリが上限を超えています。'
    )
  })

})
