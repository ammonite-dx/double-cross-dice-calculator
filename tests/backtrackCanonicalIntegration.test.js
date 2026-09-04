import { describe, expect, it, vi } from 'vitest'

import {
  createBacktrackCanonicalRunner,
} from '../src/features/backtrack/model/BacktrackCalculationRunner'
import {
  createBacktrackInputSnapshot,
} from '../src/features/backtrack/model/BacktrackInputSnapshot'
import {
  createCalculationFeedbackState,
  formatRangeFeedback,
} from '../src/runtime/CalculationFeedback'
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

function createRunner({
  canonicalResult = {
    single: 'canonical-single',
    double: 'canonical-double',
    second: 'canonical-second',
  },
  createPresentation = vi.fn(() => ({
    version: 1,
    kind: 'backtrack-canonical-presentation',
    finalEncroachment: {
      single: [10, 20],
      double: [30, 40],
      second: [50, 60],
    },
  })),
  legacyCalculate = vi.fn(async () => ({ legacy: true })),
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
  const runner = createBacktrackCanonicalRunner({
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

    await expect(setup.runner.run({params})).resolves.toBe(true)

    expect(setup.calculationClient.calculateBacktrackCanonical)
      .toHaveBeenCalledOnce()
    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(setup.calculationClient.calculateBacktrackCanonical)
      .toHaveBeenCalledWith(
        params,
        expect.objectContaining({
          signal: expect.any(Object),
          onRangePlan: expect.any(Function),
        })
      )
    expect(createPresentation).toHaveBeenCalledWith(
      canonicalResult,
      params
    )
    expect(setup.state.finalEncroachment)
      .toBe(presentation.finalEncroachment)
    expect(setup.state.finalEncroachment).not.toBe(canonicalResult)
    expect(setup.state.resultReady).toBe(true)
    expect(setup.feedback.status).toBe('ready')
  })

  it('snapshots only validated params without a temporary mode toggle', () => {
    const params = createParams()
    const snapshot = createBacktrackInputSnapshot({params})

    expect(snapshot).toEqual({params})
    expect(snapshot).not.toBe(params)
    expect(snapshot.params).not.toBe(params)
    expect(snapshot).not.toHaveProperty('canonicalOptIn')

    params.encroachment = 999
    snapshot.params.value = 123

    expect(snapshot.params.encroachment).toBe(100)
    expect(params.value).toBe(0)
  })

  it('shares range-plan feedback and suppresses stale results', async () => {
    const first = createDeferred()
    const second = createDeferred()
    const canonicalCalculate = vi.fn()
      .mockImplementationOnce((_params, options) => {
        options.onRangePlan({id: 'first-plan', accepted: true})
        return first.promise
      })
      .mockImplementationOnce((_params, options) => {
        options.onRangePlan({id: 'second-plan', accepted: true})
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
      canonicalCalculate,
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
    expect(canonicalCalculate).toHaveBeenCalledTimes(2)
    expect(canonicalCalculate).toHaveBeenLastCalledWith(
      expect.objectContaining({encroachment: 110}),
      expect.any(Object)
    )
    expect(setup.feedback.plan).toEqual({
      id: 'second-plan',
      accepted: true,
    })

    second.resolve({current: true})
    await expect(secondRun).resolves.toBe(true)
    expect(setup.state.finalEncroachment).toBe(presentation.finalEncroachment)
    expect(setup.state.finalEncroachment).not.toEqual({stale: true})
  })

  it('clears the result on abort and dispose without allowing a late commit', async () => {
    const deferred = createDeferred()
    const setup = createRunner({
      canonicalCalculate: vi.fn(() => deferred.promise),
    })
    const controller = new AbortController()
    const request = setup.runner.run({
      params: createParams(),
      signal: controller.signal,
    })

    expect(setup.state.finalEncroachment).toBeNull()
    controller.abort()
    await expect(request).resolves.toBe(false)
    expect(setup.feedback.status).toBe('idle')

    deferred.resolve({late: true})
    await Promise.resolve()
    expect(setup.state.finalEncroachment).toBeNull()

    const secondDeferred = createDeferred()
    setup.calculationClient.calculateBacktrackCanonical
      .mockReturnValueOnce(secondDeferred.promise)
    const secondRequest = setup.runner.run({
      params: createParams({value: 1}),
    })
    setup.runner.dispose()
    await expect(secondRequest).resolves.toBe(false)
    secondDeferred.resolve({afterDispose: true})
    await Promise.resolve()
    expect(setup.state.finalEncroachment).toBeNull()
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

    await expect(setup.runner.run({params: createParams()}))
      .resolves.toBe(false)

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
    await expect(setup.runner.run({
      params: createParams({encroachment: 105}),
    })).resolves.toBe(true)

    expect(canonicalCalculate).toHaveBeenCalledTimes(2)
    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(setup.state.finalEncroachment)
      .toBe(presentation.finalEncroachment)
    expect(setup.feedback.status).toBe('ready')
    expect(formatRangeFeedback(setup.feedback)).toBeNull()
  })

  it('clears presentation errors without fallback and commits on retry', async () => {
    const presentationError = new Error('presentation failed')
    const presentation = {
      version: 1,
      kind: 'backtrack-canonical-presentation',
      finalEncroachment: {
        single: [11, 22],
        double: [33, 44],
        second: [55, 66],
      },
    }
    const createPresentation = vi.fn()
      .mockImplementationOnce(() => {
        throw presentationError
      })
      .mockReturnValueOnce(presentation)
    const canonicalCalculate = vi.fn()
      .mockResolvedValue({canonical: true})
    const setup = createRunner({canonicalCalculate, createPresentation})

    await expect(setup.runner.run({params: createParams()}))
      .resolves.toBe(false)

    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(setup.state.finalEncroachment).toBeNull()
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

    expect(canonicalCalculate).toHaveBeenCalledTimes(2)
    expect(createPresentation).toHaveBeenCalledTimes(2)
    expect(setup.calculationClient.calculateBacktrack).not.toHaveBeenCalled()
    expect(setup.state.finalEncroachment)
      .toBe(presentation.finalEncroachment)
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
      canonicalCalculate: vi.fn(async () => {
        throw rangeError
      }),
    })

    await expect(setup.runner.run({params: createParams()}))
      .resolves.toBe(false)

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

})
