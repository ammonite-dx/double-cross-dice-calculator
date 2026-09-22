import {
  CALCULATION_REQUEST_STATUS,
  createCalculationRequestCoordinator,
} from './CalculationRequestCoordinator'
import type {
  CalculationFeedbackPlan,
  CalculationFeedbackState,
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

export { CALCULATION_REQUEST_STATUS, createCalculationRequestCoordinator }
