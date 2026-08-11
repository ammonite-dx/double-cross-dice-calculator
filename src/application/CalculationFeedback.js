import {
  isResourceGuardError,
  RESOURCE_GUARD_ERROR_CODES,
} from './ResourceGuard'

const RANGE_REASON_BY_CODE = Object.freeze({
  'display-points': '表示する点数が多すぎるため、計算結果を表示できません。',
  'incompatible-input': '《妖精の手》と《支配の領域》は同時に使用できません。',
  'score-working-length': '判定計算の作業範囲が大きくなっています。',
  'score-fft-length': '判定計算のFFT範囲が大きくなっています。',
  'damage-working-length': 'ダメージ計算の作業範囲が大きくなっています。',
  'damage-fft-length': 'ダメージ計算のFFT範囲が大きくなっています。',
  'backtrack-working-length': 'バックトラック計算の作業範囲が大きくなっています。',
  'backtrack-asset-overflow': '静的なバックトラック用データのcoverageが不足しています（計算結果のoverflowではありません）。完全supportはオンデマンド計算を使用してください。',
  'estimated-memory': '計算に必要なメモリが大きくなっています。',
  'estimated-time': '計算に時間がかかる可能性があります。',
  'tail-cutoff-unreachable': '判定の末尾誤差を指定範囲まで抑えられません。',
  'tail-error': '判定の末尾誤差が許容値を超えています。',
})

const OVERFLOW_LABEL_BY_TYPE = Object.freeze({
  score: '判定の計算範囲',
  damage: 'ダメージの計算範囲',
  display: '表示範囲',
  backtrack: 'バックトラックの計算範囲',
})

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatNumber(value, maximumFractionDigits = 1) {
  if (!isFiniteNumber(value)) {
    return null
  }
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits,
  }).format(value)
}

function formatTime(value) {
  const formatted = formatNumber(value)
  return formatted === null ? null : `${formatted} ms`
}

function formatMemory(value) {
  if (!isFiniteNumber(value)) {
    return null
  }
  if (value >= 1024 * 1024) {
    return `${formatNumber(value / (1024 * 1024), 2)} MiB`
  }
  if (value >= 1024) {
    return `${formatNumber(value / 1024, 1)} KiB`
  }
  return `${formatNumber(value, 0)} bytes`
}

function formatWarningReason(warning) {
  if (!warning || typeof warning !== 'object') {
    return '計算範囲の制限により、計算を続けられません。'
  }
  return RANGE_REASON_BY_CODE[warning.code]
    ?? '計算範囲の制限により、計算できる範囲を調整しています。'
}

function formatResourceGuardReason(error) {
  const details = error?.details ?? {}
  const requestedBytes = details.reservedBytes ?? details.float64Bytes
  const requested = formatMemory(requestedBytes)
  const capacity = formatMemory(details.capacityBytes)
  if (error?.code === RESOURCE_GUARD_ERROR_CODES.OVERSIZE) {
    return requested && capacity
      ? `この計算の予約量（${requested}）が上限（${capacity}）を超えています。`
      : 'この計算の予約量が設定された上限を超えています。'
  }
  if (error?.code === RESOURCE_GUARD_ERROR_CODES.QUEUE_FULL) {
    const queued = details.queuedCount
    const maxQueued = details.maxQueued
    return Number.isFinite(queued) && Number.isFinite(maxQueued)
      ? `計算待ち行列が満杯です（${queued}/${maxQueued}）。しばらく待ってから再試行してください。`
      : '計算待ち行列が満杯です。しばらく待ってから再試行してください。'
  }
  return '計算資源の予約に失敗しました。入力を確認して再試行してください。'
}

function collectWarnings(plan, feedback) {
  const warnings = Array.isArray(plan?.warnings)
    ? plan.warnings.filter((warning) => warning && typeof warning === 'object')
    : []
  const rejectionReasons = [
    ...(Array.isArray(plan?.rejectionReasons) ? plan.rejectionReasons : []),
    ...(Array.isArray(feedback?.error?.rejectionReasons)
      ? feedback.error.rejectionReasons
      : []),
  ]
  const knownCodes = new Set(warnings.map((warning) => warning.code))
  for (const code of rejectionReasons) {
    if (!knownCodes.has(code)) {
      warnings.push({ code, severity: 'reject' })
      knownCodes.add(code)
    }
  }
  return warnings
}

function collectOverflowMessages(plan) {
  return Object.entries(plan?.overflowInfo ?? {})
    .map(([type, info]) => ({
      label: OVERFLOW_LABEL_BY_TYPE[type],
      lowerBound: info?.lowerBound,
    }))
    .filter(({ label, lowerBound }) => label && isFiniteNumber(lowerBound))
    .map(({ label, lowerBound }) =>
      `${label}: ${formatNumber(lowerBound, 0)}以上の値をまとめて扱います。`
    )
}

export function createCalculationFeedbackState() {
  return {
    status: 'idle',
    plan: null,
    error: null,
  }
}

export function copyCalculationFeedback(feedback) {
  return {
    status: feedback?.status ?? 'idle',
    plan: feedback?.plan ?? null,
    error: feedback?.error ?? null,
  }
}

function hasValue(value) {
  return value !== null && value !== undefined
}

export function createTotalDamageState(initialCalculation = null) {
  const ready = hasValue(initialCalculation?.damage)
    && hasValue(initialCalculation?.damageSummary)
  return {
    totalDamage: ready ? initialCalculation.damage : null,
    totalDamageSummary: ready ? initialCalculation.damageSummary : null,
    totalDamageGeneration: 0,
    totalDamageReady: ready,
  }
}

export function invalidateTotalDamage(state) {
  state.totalDamageGeneration += 1
  state.totalDamageReady = false
  state.totalDamage = null
  state.totalDamageSummary = null
  return state.totalDamageGeneration
}

export function commitTotalDamage(state, generation, result) {
  if (generation !== state.totalDamageGeneration) {
    return false
  }
  if (!hasValue(result?.totalDamage) || !hasValue(result?.totalDamageSummary)) {
    return false
  }
  state.totalDamage = result.totalDamage
  state.totalDamageSummary = result.totalDamageSummary
  state.totalDamageReady = true
  return true
}

export function areAllComboResultsReady(combos) {
  return Array.isArray(combos)
    && combos.length > 0
    && combos.every((combo) => {
      const data = combo?.data
      return data?.resultReady === true
        && hasValue(data.score)
        && hasValue(data.scoreSummary)
        && hasValue(data.damage)
        && hasValue(data.damageSummary)
    })
}

export function beginCalculation(feedback) {
  feedback.status = 'loading'
  feedback.plan = null
  feedback.error = null
}

export function publishRangePlan(feedback, plan) {
  feedback.plan = plan ?? null
  feedback.error = null
}

export function completeCalculation(feedback) {
  feedback.status = 'ready'
  feedback.error = null
}

export function markCalculationAborted(feedback) {
  feedback.status = 'idle'
  feedback.plan = null
  feedback.error = null
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function isCalculationRangeError(error) {
  return error?.name === 'CalculationRangeError'
}

export function recordCalculationError(feedback, error) {
  if (isAbortError(error)) {
    markCalculationAborted(feedback)
    return
  }
  feedback.status = isCalculationRangeError(error) ? 'rejected' : 'error'
  feedback.plan = error?.plan ?? feedback.plan
  feedback.error = error ?? null
}

export function formatRangeFeedback(feedback) {
  if (feedback?.error?.name === 'AbortError') {
    return null
  }
  const plan = feedback?.plan
  const warnings = collectWarnings(plan, feedback)
  const rejected = feedback?.status === 'rejected'
    || plan?.accepted === false
    || warnings.some((warning) => warning.severity === 'reject')
  const hasResourceError = isResourceGuardError(feedback?.error)
  const hasGenericError = feedback?.status === 'error' && !hasResourceError
  const visibleWarnings = warnings.filter((warning) =>
    rejected || warning.severity === 'warning'
  )

  if (!hasGenericError && !hasResourceError && visibleWarnings.length === 0) {
    return null
  }

  return {
    type: hasGenericError || hasResourceError || rejected ? 'error' : 'warning',
    title: hasResourceError
      ? '計算資源の制約により計算できません'
      : hasGenericError
      ? '計算に失敗しました'
      : rejected
        ? 'この入力では計算できません'
        : '計算範囲に関する注意',
    reasons: [
      ...(hasResourceError
        ? [formatResourceGuardReason(feedback.error)]
        : []),
      ...(hasGenericError
        ? ['計算中にエラーが発生しました。入力内容を確認して再入力してください。']
        : []),
      ...visibleWarnings.map(formatWarningReason),
    ],
    metrics: {
      time: formatTime(plan?.estimates?.timeMs),
      memory: formatMemory(plan?.estimates?.float64Bytes),
    },
    overflow: collectOverflowMessages(plan),
    action: hasResourceError
      ? '同時実行中の計算が終わるのを待つか、入力を小さくして再試行してください。'
      : hasGenericError
      ? '入力内容を確認して、もう一度お試しください。'
      : rejected
      ? '入力値を下げるか、表示範囲を狭めて再試行してください。'
      : 'このまま計算しますが、処理に時間がかかる場合があります。',
  }
}

function combineAbortSignals(externalSignal, internalSignal) {
  const signals = [externalSignal, internalSignal].filter(Boolean)
  if (signals.length <= 1) {
    return signals[0]
  }
  if (
    typeof AbortSignal !== 'undefined'
    && typeof AbortSignal.any === 'function'
  ) {
    return AbortSignal.any(signals)
  }
  if (typeof AbortController !== 'function') {
    return externalSignal ?? internalSignal
  }

  const controller = new AbortController()
  const cleanup = []
  const abort = () => {
    for (const removeListener of cleanup.splice(0)) {
      removeListener()
    }
    controller.abort()
  }
  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      break
    }
    const listener = () => abort()
    signal.addEventListener('abort', listener, { once: true })
    cleanup.push(() => signal.removeEventListener('abort', listener))
  }
  return controller.signal
}

export async function runInitialCalculation({ feedback, calculate, onError }) {
  beginCalculation(feedback)
  try {
    const result = await calculate({
      onRangePlan: (plan) => publishRangePlan(feedback, plan),
    })
    completeCalculation(feedback)
    return result
  } catch (error) {
    if (isAbortError(error)) {
      markCalculationAborted(feedback)
      return null
    }
    recordCalculationError(feedback, error)
    if (!isCalculationRangeError(error)) {
      onError?.(error)
    }
    return null
  }
}

/**
 * Runs only the latest request. The optional caller signal is composed with
 * the controller owned by this runner, so neither cancellation source is
 * overwritten.
 */
export function createLatestCalculationRunner({
  feedback,
  calculate,
  clearResult,
  commitResult,
  onError,
}) {
  let revision = 0
  let abortController = null

  const run = async (options = {}) => {
    const requestRevision = ++revision
    abortController?.abort()
    abortController = typeof AbortController === 'function'
      ? new AbortController()
      : null

    beginCalculation(feedback)
    clearResult?.()

    const providedOnRangePlan = options.onRangePlan
    const requestOptions = {
      ...options,
      ...(abortController || options.signal
        ? {
            signal: combineAbortSignals(
              options.signal,
              abortController?.signal
            ),
          }
        : {}),
      onRangePlan: (plan) => {
        if (requestRevision !== revision) {
          return
        }
        publishRangePlan(feedback, plan)
        providedOnRangePlan?.(plan)
      },
    }

    try {
      const result = await calculate(requestOptions)
      if (requestRevision !== revision) {
        return false
      }
      const committed = commitResult?.(result)
      if (committed === false) {
        return false
      }
      completeCalculation(feedback)
      return true
    } catch (error) {
      if (requestRevision !== revision) {
        return false
      }
      if (isAbortError(error)) {
        markCalculationAborted(feedback)
        return false
      }
      recordCalculationError(feedback, error)
      if (isCalculationRangeError(error)) {
        clearResult?.()
      } else {
        onError?.(error)
      }
      return false
    }
  }

  const invalidate = () => {
    revision += 1
    abortController?.abort()
    abortController = null
  }

  return { run, invalidate }
}
