import {
  CALCULATION_REQUEST_STATUS,
  createCalculationRequestCoordinator,
} from './CalculationRequestCoordinator'
import type {
  CalculationCancellationContext,
  CalculationFeedbackPlan,
  CalculationFeedbackState,
  CalculationRunnerContext,
  LatestCalculationRunner,
  LatestCalculationRunnerOptions,
} from './CalculationFeedbackTypes'
import type { CalculationRangePlan } from '../calculation/planning/RangePlannerTypes'

type RecordValue = Record<PropertyKey, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object'
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
