import {
  isResourceGuardError,
  RESOURCE_GUARD_ERROR_CODES,
} from './ResourceGuard'
import {
  CALCULATION_REQUEST_STATUS,
  createCalculationRequestCoordinator,
} from './CalculationRequestCoordinator'
import type {
  CalculationCancellationContext,
  CalculationFeedbackPlan,
  CalculationFeedbackState,
  CalculationRangeFeedbackDisplay,
  CalculationRunnerContext,
  LatestCalculationRunner,
  LatestCalculationRunnerOptions,
} from './CalculationFeedbackTypes'
import type { CalculationRangePlan } from '../calculation/planning/RangePlannerTypes'

const RANGE_REASON_BY_CODE: Readonly<Record<string, string>> = Object.freeze({
  'display-points': '表示する点数が多すぎるため、計算結果を表示できません。',
  'display-point-count': '表示する点数が多すぎるため、計算結果を表示できません。',
  'display-float64-memory': '表示用メモリの見積りが大きすぎるため、計算結果を表示できません。',
  'chart-point-count': 'チャートへ描画する点数が多すぎるため、計算結果を表示できません。',
  'check-exact-overflow-overlap': '表示範囲に正確なoverflowが重なるため、表示範囲を拡張して再計算してください。',
  'check-upper-bound-overflow': '上限だけが分かるoverflowを表示範囲へ安全に投影できません。表示範囲を狭めて再試行してください。',
  'check-not-projectable': 'この計算結果を指定の表示範囲へ安全に投影できません。表示範囲を狭めて再試行してください。',
  'attack-display-recalculate': 'Attackの計算結果に指定表示範囲のcoverageがないため、表示できません。',
  'attack-display-resource-rejected': 'Attackの表示範囲が資源上限を超えているため、表示できません。',
  'attack-display-not-projectable': 'Attackの計算結果を指定の表示範囲へ安全に投影できません。',
  'attack-score-display-recalculate': 'AttackのScoreに指定表示範囲のcoverageがないため、表示できません。表示範囲を狭めて再入力してください。',
  'attack-score-display-resource-rejected': 'AttackのScore表示範囲が資源上限を超えているため、表示できません。表示範囲を狭めて再入力してください。',
  'attack-score-display-not-projectable': 'AttackのScore計算結果を指定表示範囲へ安全に投影できません。表示範囲を狭めて再入力してください。',
  'attack-summary-not-projectable': '期待値が正確値でないため、サマリーの数値を表示できません。',
  'incompatible-input': '《妖精の手》と《支配の領域》は同時に使用できません。',
  'score-working-length': '判定計算の作業範囲が上限を超えています。',
  'score-fft-length': '判定計算のFFT範囲が上限を超えています。',
  'damage-working-length': 'ダメージ計算の作業範囲が上限を超えています。',
  'damage-fft-length': 'ダメージ計算のFFT範囲が上限を超えています。',
  'damage-generation': 'ダメージロールの計算量が上限を超えています。',
  'defence-d10-length': '防御側の10面ダイス計算範囲が上限を超えています。',
  'defence-d10-generation': '防御側の10面ダイス生成計算量が上限を超えています。',
  'backtrack-working-length': 'バックトラック計算の作業範囲が上限を超えています。',
  'backtrack-generation': 'バックトラックの生成計算量が上限を超えています。',
  'backtrack-asset-overflow': '静的なバックトラック用データのcoverageが不足しています（計算結果のoverflowではありません）。完全supportはオンデマンド計算を使用してください。',
  'estimated-memory': '計算に必要なメモリが上限を超えています。',
  'cpu-work': '計算量が上限を超えています。',
  'tail-cutoff-unreachable': '判定の末尾誤差を指定範囲まで抑えられません。',
  'tail-error': '判定の末尾誤差が許容値を超えています。',
})

const OVERFLOW_LABEL_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  score: '判定の計算範囲',
  damage: 'ダメージの計算範囲',
  display: '表示範囲',
  backtrack: 'バックトラックの計算範囲',
})

type RecordValue = Record<PropertyKey, unknown>

interface FeedbackWarning {
  readonly code: string
  readonly severity?: string
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object'
}

function isFeedbackWarning(value: unknown): value is FeedbackWarning {
  return isRecord(value) && typeof value.code === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatNumber(value: unknown, maximumFractionDigits = 1): string | null {
  if (!isFiniteNumber(value)) {
    return null
  }
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits,
  }).format(value)
}

function formatMemory(value: unknown): string | null {
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

function formatWarningReason(warning: FeedbackWarning): string {
  const reason = RANGE_REASON_BY_CODE[warning.code]
  if (reason) {
    return reason
  }
  return warning.severity === 'reject'
    ? '計算資源または計算範囲の上限を超えています。'
    : '計算範囲の制限により、計算できる範囲を調整しています。'
}

function formatResourceGuardReason(error: unknown): string {
  const details = isRecord(error) && isRecord(error.details)
    ? error.details
    : {}
  const requestedBytes = details.reservedBytes ?? details.float64Bytes
  const requested = formatMemory(requestedBytes)
  const capacity = formatMemory(details.capacityBytes)
  if (isRecord(error) && error.code === RESOURCE_GUARD_ERROR_CODES.OVERSIZE) {
    return requested && capacity
      ? `この計算の予約量（${requested}）が上限（${capacity}）を超えています。`
      : 'この計算の予約量が設定された上限を超えています。'
  }
  if (isRecord(error) && error.code === RESOURCE_GUARD_ERROR_CODES.QUEUE_FULL) {
    const queued = details.queuedCount
    const maxQueued = details.maxQueued
    return isFiniteNumber(queued) && isFiniteNumber(maxQueued)
      ? `計算待ち行列が満杯です（${queued}/${maxQueued}）。しばらく待ってから再試行してください。`
      : '計算待ち行列が満杯です。しばらく待ってから再試行してください。'
  }
  return '計算資源の予約に失敗しました。入力を確認して再試行してください。'
}

function planWarnings(plan: CalculationFeedbackPlan | null | undefined): FeedbackWarning[] {
  if (!isRecord(plan) || !Array.isArray(plan.warnings)) {
    return []
  }
  return plan.warnings.filter(isFeedbackWarning)
}

function errorRejectionReasons(error: unknown): string[] {
  if (!isRecord(error) || !Array.isArray(error.rejectionReasons)) {
    return []
  }
  return error.rejectionReasons.filter(
    (code): code is string => typeof code === 'string',
  )
}

function planRejectionReasons(plan: CalculationFeedbackPlan | null | undefined): string[] {
  if (!isRecord(plan) || !Array.isArray(plan.rejectionReasons)) {
    return []
  }
  return plan.rejectionReasons.filter(
    (code): code is string => typeof code === 'string',
  )
}

function collectWarnings(
  plan: CalculationFeedbackPlan | null | undefined,
  feedback: CalculationFeedbackState<CalculationFeedbackPlan> | null | undefined,
): FeedbackWarning[] {
  const warnings = planWarnings(plan)
  const rejectionReasons = [
    ...planRejectionReasons(plan),
    ...errorRejectionReasons(feedback?.error),
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

function collectOverflowMessages(
  plan: CalculationFeedbackPlan | null | undefined,
): string[] {
  const overflowInfo = isRecord(plan?.overflowInfo)
    ? plan.overflowInfo
    : {}
  return Object.entries(overflowInfo)
    .map(([type, info]) => {
      const lowerBound = isRecord(info) ? info.lowerBound : undefined
      return {
        label: OVERFLOW_LABEL_BY_TYPE[type],
        lowerBound,
      }
    })
    .filter(({ label, lowerBound }) => label && isFiniteNumber(lowerBound))
    .map(({ label, lowerBound }) =>
      `${label}: ${formatNumber(lowerBound, 0)}以上の値をまとめて扱います。`,
    )
}

export function createCalculationFeedbackState<
  TPlan extends CalculationFeedbackPlan = CalculationRangePlan,
>(): CalculationFeedbackState<TPlan> {
  return {
    status: 'idle',
    plan: null,
    error: null,
  }
}

export function copyCalculationFeedback<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan> | null | undefined,
): CalculationFeedbackState<TPlan> {
  return {
    status: feedback?.status ?? 'idle',
    plan: feedback?.plan ?? null,
    error: feedback?.error ?? null,
  }
}

export function beginCalculation<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan>,
): void {
  feedback.status = 'loading'
  feedback.plan = null
  feedback.error = null
}

export function publishRangePlan<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan>,
  plan: TPlan | null | undefined,
): void {
  feedback.plan = plan ?? null
  feedback.error = null
}

export function completeCalculation<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan>,
): void {
  feedback.status = 'ready'
  feedback.error = null
}

export function markCalculationAborted<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan>,
): void {
  feedback.status = 'idle'
  feedback.plan = null
  feedback.error = null
}

export function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError'
}

export function isCalculationRangeError(error: unknown): boolean {
  return isRecord(error) && error.name === 'CalculationRangeError'
}

export function recordCalculationError<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan>,
  error: unknown,
): void {
  if (isAbortError(error)) {
    markCalculationAborted(feedback)
    return
  }
  feedback.status = isCalculationRangeError(error) ? 'rejected' : 'error'
  if (isRecord(error) && isRecord(error.plan)) {
    feedback.plan = error.plan as TPlan
  }
  feedback.error = error
}

export function formatRangeFeedback<TPlan extends CalculationFeedbackPlan>(
  feedback: CalculationFeedbackState<TPlan>,
): CalculationRangeFeedbackDisplay | null {
  if (isAbortError(feedback?.error)) {
    return null
  }
  const plan = feedback?.plan
  const warnings = collectWarnings(
    plan,
    feedback as CalculationFeedbackState<CalculationFeedbackPlan>,
  )
  const rejected = feedback?.status === 'rejected'
    || plan?.accepted === false
    || warnings.some((warning) => warning.severity === 'reject')
  const hasResourceError = isResourceGuardError(feedback?.error)
  const hasGenericError = feedback?.status === 'error' && !hasResourceError
  const visibleWarnings = warnings.filter((warning) =>
    rejected || warning.severity === 'warning',
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
      memory: formatMemory(
        isRecord(plan?.estimates) ? plan.estimates.float64Bytes : undefined,
      ),
    },
    overflow: collectOverflowMessages(plan),
    action: hasResourceError
      ? '同時実行中の計算が終わるのを待つか、入力を小さくして再試行してください。'
      : hasGenericError
      ? '入力内容を確認して、もう一度お試しください。'
      : rejected
      ? '入力値を下げるか、表示範囲を狭めて再試行してください。'
      : 'このまま計算します。',
  }
}

export async function runInitialCalculation<
  TPlan extends CalculationFeedbackPlan,
  TResult,
>({
  feedback,
  calculate,
  onError,
}: {
  feedback: CalculationFeedbackState<TPlan>
  calculate: (context: {
    onRangePlan: (plan: TPlan) => void
  }) => TResult | Promise<TResult>
  onError?: (error: unknown) => void
}): Promise<TResult | null> {
  beginCalculation(feedback)
  try {
    const result = await calculate({
      onRangePlan: (plan) => publishRangePlan(feedback, plan),
    })
    completeCalculation(feedback)
    return result
  } catch (error: unknown) {
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
 * Compatibility adapter for existing feedback-aware callers. New request
 * lanes can use createCalculationRequestCoordinator directly; this adapter
 * preserves the existing run(options)/invalidate() contract while sharing
 * the same one-running-plus-one-pending coordinator.
 */
export function createLatestCalculationRunner<
  TRequest extends object,
  TResult,
  TPlan extends CalculationFeedbackPlan = CalculationRangePlan,
>(
  {
    feedback,
    calculate,
    clearResult,
    commitResult,
    onError,
    onCancelled,
    snapshotRequest,
  }: LatestCalculationRunnerOptions<TRequest, TResult, TPlan>,
): LatestCalculationRunner<TRequest, TResult, TPlan> {
  const coordinator = createCalculationRequestCoordinator<
    TRequest,
    TResult,
    TPlan,
    TRequest
  >({
    snapshotRequest,
    execute: (request, context) => calculate({
      ...request,
      signal: context.signal,
      onRangePlan: context.onRangePlan,
    }),
    onStart: () => {
      beginCalculation(feedback)
      clearResult?.()
    },
    onPlan: (plan) => publishRangePlan(feedback, plan),
    commit: (result) => commitResult?.(result),
    onCommitted: () => completeCalculation(feedback),
    onCancelled: (context) => {
      markCalculationAborted(feedback)
      onCancelled?.(
        context as CalculationCancellationContext<TRequest, TPlan, TRequest>,
      )
    },
    onError: (error) => {
      recordCalculationError(feedback, error)
      if (isCalculationRangeError(error)) {
        clearResult?.()
      } else {
        onError?.(error)
      }
    },
  })

  return {
    run(request?: TRequest) {
      const actualRequest = request ?? {} as TRequest
      return coordinator.run(actualRequest, actualRequest)
    },
    invalidate: coordinator.invalidate,
    dispose: coordinator.dispose,
    snapshot: coordinator.snapshot,
  }
}

export { CALCULATION_REQUEST_STATUS, createCalculationRequestCoordinator }
