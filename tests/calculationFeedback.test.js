import { describe, expect, it, vi } from 'vitest'

import {
  areAllComboResultsReady,
  commitTotalDamage,
  createCalculationFeedbackState,
  createLatestCalculationRunner,
  createTotalDamageState,
  formatRangeFeedback,
  invalidateTotalDamage,
  runInitialCalculation,
} from '../src/application/CalculationFeedback'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const warningPlan = {
  accepted: true,
  warnings: [
    { code: 'estimated-time', severity: 'warning' },
    { code: 'backtrack-asset-overflow', severity: 'warning' },
  ],
  estimates: {
    timeMs: 52.5,
    float64Bytes: 2 * 1024 * 1024,
  },
  overflowInfo: {
    display: { lowerBound: 1000 },
    backtrack: { lowerBound: 1024 },
  },
}

const rejectionPlan = {
  accepted: false,
  rejectionReasons: ['estimated-time'],
  warnings: [
    { code: 'estimated-time', severity: 'reject' },
  ],
  estimates: {
    timeMs: 201,
    float64Bytes: 65 * 1024 * 1024,
  },
  overflowInfo: {
    display: { lowerBound: 1000 },
  },
}

function createRangeError(plan) {
  const error = new Error('range rejected')
  error.name = 'CalculationRangeError'
  error.plan = plan
  error.rejectionReasons = plan.rejectionReasons
  return error
}

describe('CalculationFeedback', () => {
  it('requires every combo result before an aggregate can be displayed', () => {
    const combos = [
      {
        data: {
          resultReady: true,
          score: {},
          scoreSummary: {},
          damage: {},
          damageSummary: {},
        },
      },
      {
        data: {
          resultReady: false,
          score: null,
          scoreSummary: null,
          damage: null,
          damageSummary: null,
        },
      },
    ]
    expect(areAllComboResultsReady(combos)).toBe(false)

    combos[1].data = {
      resultReady: true,
      score: {},
      scoreSummary: {},
      damage: {},
      damageSummary: {},
    }
    expect(areAllComboResultsReady(combos)).toBe(true)

    const state = createTotalDamageState({
      damage: 'old total',
      damageSummary: 'old summary',
    })
    const staleGeneration = invalidateTotalDamage(state)
    const currentGeneration = invalidateTotalDamage(state)

    expect(state.totalDamageReady).toBe(false)
    expect(commitTotalDamage(state, staleGeneration, {
      totalDamage: 'stale total',
      totalDamageSummary: 'stale summary',
    })).toBe(false)
    expect(state.totalDamage).toBeNull()
    expect(commitTotalDamage(state, currentGeneration, {
      totalDamage: 'current total',
      totalDamageSummary: 'current summary',
    })).toBe(true)
    expect(state.totalDamageReady).toBe(true)
    expect(state.totalDamage).toBe('current total')
  })

  it('formats accepted warnings with Japanese reasons, resource estimates, and overflow bounds', () => {
    const display = formatRangeFeedback({
      status: 'ready',
      plan: warningPlan,
    })

    expect(display.type).toBe('warning')
    expect(display.reasons).toContain('計算に時間がかかる可能性があります。')
    expect(display.reasons).toContain('静的なバックトラック用データのcoverageが不足しています（計算結果のoverflowではありません）。完全supportはオンデマンド計算を使用してください。')
    expect(display.metrics.time).toBe('52.5 ms')
    expect(display.metrics.memory).toBe('2 MiB')
    expect(display.overflow).toContain('表示範囲: 1,000以上の値をまとめて扱います。')
    expect(display.overflow).toContain('バックトラックの計算範囲: 1,024以上の値をまとめて扱います。')
    expect(display.reasons.join(' ')).not.toContain('estimated-time')
  })

  it('formats hard rejects as errors and provides a recovery action', () => {
    const display = formatRangeFeedback({
      status: 'rejected',
      plan: rejectionPlan,
      error: { rejectionReasons: rejectionPlan.rejectionReasons },
    })

    expect(display.type).toBe('error')
    expect(display.title).toBe('この入力では計算できません')
    expect(display.reasons).toEqual(['計算に時間がかかる可能性があります。'])
    expect(display.action).toContain('入力値を下げる')
  })

  it.each(['check', 'attack', 'backtrack'])(
    'ignores stale range plans and stale errors for the %s request path',
    async () => {
      const feedback = createCalculationFeedbackState()
      const first = createDeferred()
      const second = createDeferred()
      const onError = vi.fn()
      const commitResult = vi.fn()
      let callCount = 0
      const runner = createLatestCalculationRunner({
        feedback,
        calculate: (options) => {
          callCount += 1
          options.onRangePlan(callCount === 1 ? rejectionPlan : warningPlan)
          return callCount === 1 ? first.promise : second.promise
        },
        clearResult: vi.fn(),
        commitResult,
        onError,
      })

      const firstRequest = runner.run()
      const secondRequest = runner.run()
      first.reject(createRangeError(rejectionPlan))
      second.resolve('current result')

      await Promise.all([firstRequest, secondRequest])

      expect(feedback.status).toBe('ready')
      expect(feedback.plan).toBe(warningPlan)
      expect(feedback.error).toBeNull()
      expect(commitResult).toHaveBeenCalledWith('current result')
      expect(onError).not.toHaveBeenCalled()
    }
  )

  it('uses a snapshot of queued runner options when the request starts', async () => {
    const feedback = createCalculationFeedbackState()
    const first = createDeferred()
    const receivedOptions = []
    let callCount = 0
    const runner = createLatestCalculationRunner({
      feedback,
      calculate: (options) => {
        callCount += 1
        receivedOptions.push(options)
        return callCount === 1
          ? first.promise
          : Promise.resolve('latest result')
      },
      commitResult: vi.fn(),
    })

    const firstRequest = runner.run({ id: 'first' })
    const queuedOptions = {
      id: 'queued',
      payload: { value: 'before queue starts' },
    }
    const latestRequest = runner.run(queuedOptions)
    queuedOptions.payload.value = 'mutated after submit'

    first.resolve('first result')
    await expect(firstRequest).resolves.toBe(false)
    await expect(latestRequest).resolves.toBe(true)

    expect(receivedOptions).toHaveLength(2)
    expect(receivedOptions[1]).not.toBe(queuedOptions)
    expect(receivedOptions[1]).toMatchObject({
      id: 'queued',
      payload: { value: 'before queue starts' },
    })
  })

  it('does not expose AbortError as a user-facing error', async () => {
    const feedback = createCalculationFeedbackState()
    const onError = vi.fn()
    const commitResult = vi.fn()
    const runner = createLatestCalculationRunner({
      feedback,
      calculate: async (options) => {
        options.onRangePlan(warningPlan)
        const error = new Error('cancelled')
        error.name = 'AbortError'
        throw error
      },
      clearResult: vi.fn(),
      commitResult,
      onError,
    })

    await runner.run()

    expect(feedback.status).toBe('idle')
    expect(feedback.plan).toBeNull()
    expect(formatRangeFeedback(feedback)).toBeNull()
    expect(commitResult).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('shows a generic error without leaking internal details and clears it on retry', async () => {
    const feedback = createCalculationFeedbackState()
    const internalError = new Error('private stack detail')
    const onError = vi.fn()
    const commitResult = vi.fn()
    let callCount = 0
    const runner = createLatestCalculationRunner({
      feedback,
      calculate: async () => {
        callCount += 1
        if (callCount === 1) {
          throw internalError
        }
        return 'current result'
      },
      clearResult: vi.fn(),
      commitResult,
      onError,
    })

    await runner.run()

    const display = formatRangeFeedback(feedback)
    expect(feedback.status).toBe('error')
    expect(display.type).toBe('error')
    expect(display.reasons.join(' ')).not.toContain('private stack detail')
    expect(display.action).toContain('もう一度')
    expect(onError).toHaveBeenCalledWith(internalError)

    await runner.run()

    expect(feedback.status).toBe('ready')
    expect(formatRangeFeedback(feedback)).toBeNull()
    expect(commitResult).toHaveBeenCalledWith('current result')
  })

  it('keeps an initial hard reject as UI feedback without reporting it as a console error', async () => {
    const feedback = createCalculationFeedbackState()
    const onError = vi.fn()

    const result = await runInitialCalculation({
      feedback,
      onError,
      calculate: async (options) => {
        options.onRangePlan(rejectionPlan)
        throw createRangeError(rejectionPlan)
      },
    })

    expect(result).toBeNull()
    expect(feedback.status).toBe('rejected')
    expect(formatRangeFeedback(feedback).type).toBe('error')
    expect(onError).not.toHaveBeenCalled()
  })

  it('commits a successful initial calculation and keeps its range plan', async () => {
    const feedback = createCalculationFeedbackState()
    const initialPlan = { accepted: true, id: 'initial-plan' }
    const onError = vi.fn()

    await expect(runInitialCalculation({
      feedback,
      onError,
      calculate: async ({ onRangePlan }) => {
        onRangePlan(initialPlan)
        return { score: 'initial result' }
      },
    })).resolves.toEqual({ score: 'initial result' })

    expect(feedback).toEqual({
      status: 'ready',
      plan: initialPlan,
      error: null,
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores a result after the runner is invalidated by unmount', async () => {
    const feedback = createCalculationFeedbackState()
    const deferred = createDeferred()
    const commitResult = vi.fn()
    const runner = createLatestCalculationRunner({
      feedback,
      calculate: () => deferred.promise,
      commitResult,
    })

    const request = runner.run()
    runner.invalidate()
    deferred.resolve('unmounted result')

    await request

    expect(commitResult).not.toHaveBeenCalled()
    expect(formatRangeFeedback(feedback)).toBeNull()
  })

  it('composes the caller signal with the runner-owned signal', async () => {
    const feedback = createCalculationFeedbackState()
    const externalController = new AbortController()
    const first = createDeferred()
    let receivedSignal
    let callCount = 0
    const runner = createLatestCalculationRunner({
      feedback,
      calculate: (options) => {
        callCount += 1
        if (callCount === 1) {
          receivedSignal = options.signal
          return first.promise
        }
        return Promise.resolve('current result')
      },
      commitResult: vi.fn(),
    })

    const firstRequest = runner.run({ signal: externalController.signal })
    expect(receivedSignal).not.toBe(externalController.signal)
    externalController.abort()
    expect(receivedSignal.aborted).toBe(true)

    const secondRequest = runner.run()
    first.resolve('stale result')
    await Promise.all([firstRequest, secondRequest])
  })
})
