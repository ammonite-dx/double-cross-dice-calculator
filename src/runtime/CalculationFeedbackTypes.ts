import type { CalculationRangePlan } from '../calculation/planning/RangePlannerTypes'
import type { CalculationRequestStatus } from './CalculationRequestStatus'

export type { CalculationRequestStatus } from './CalculationRequestStatus'

export type CalculationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'warning'
  | 'rejected'
  | 'error'

/** The subset of a range/display plan consumed by the feedback formatter. */
export interface CalculationFeedbackPlan {
  readonly accepted?: boolean
  readonly warnings?: unknown
  readonly rejectionReasons?: unknown
  readonly estimates?: unknown
  readonly overflowInfo?: unknown
}

export interface CalculationFeedbackState<
  TPlan extends CalculationFeedbackPlan = CalculationRangePlan,
> {
  status: CalculationStatus
  plan: TPlan | null
  error: unknown
}

/** Caller-supplied fields that are also passed to a coordinator request. */
export interface CalculationCoordinatorRequestOptions<TPlan> {
  readonly signal?: AbortSignal
  readonly onRangePlan?: (plan: TPlan) => void
}

export type CalculationCoordinatorOptionsValue<
  TPlan,
  TOptions extends object,
> = TOptions & CalculationCoordinatorRequestOptions<TPlan>

export interface CalculationRequestContext<
  TRequest,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> {
  readonly revision: number
  readonly request: TRequest
  readonly signal: AbortSignal | null | undefined
  readonly options: CalculationCoordinatorOptionsValue<TPlan, TOptions>
}

export interface CalculationRunnerContext<
  TRequest,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> extends CalculationRequestContext<TRequest, TPlan, TOptions> {
  readonly onRangePlan: (plan: TPlan) => void
}

export interface CalculationSnapshotErrorContext<
  TRequest,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> {
  readonly revision: number
  readonly request: TRequest
  readonly options: CalculationCoordinatorOptionsValue<TPlan, TOptions>
}

export interface CalculationSyntheticCancellationContext {
  readonly revision: number
  readonly request: null
  readonly signal: null
  readonly options: Record<string, never>
}

export type CalculationCancellationContext<
  TRequest,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> = CalculationRequestContext<TRequest, TPlan, TOptions>
  | CalculationSyntheticCancellationContext

export type CalculationErrorContext<
  TRequest,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> = CalculationSnapshotErrorContext<TRequest, TPlan, TOptions>
  | CalculationRunnerContext<TRequest, TPlan, TOptions>

export interface CalculationCoordinatorState {
  readonly status: CalculationRequestStatus
  readonly revision: number
  readonly activeRevision: number | null
  readonly queuedRevision: number | null
  readonly disposed: boolean
}

export interface CalculationCoordinatorOptions<
  TRequest,
  TResult,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> {
  readonly execute: (
    request: TRequest,
    context: CalculationRunnerContext<TRequest, TPlan, TOptions>,
  ) => TResult | Promise<TResult>
  readonly snapshotRequest?: (request: TRequest) => TRequest
  readonly commit?: (
    result: TResult,
    context: CalculationRunnerContext<TRequest, TPlan, TOptions>,
  ) => boolean | void
  readonly onStart?: (
    request: TRequest,
    context: CalculationRequestContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onPlan?: (
    plan: TPlan,
    context: CalculationRunnerContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onCommitted?: (
    result: TResult,
    context: CalculationRunnerContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onError?: (
    error: unknown,
    context: CalculationErrorContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onCancelled?: (
    context: CalculationCancellationContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onStateChange?: (state: CalculationCoordinatorState) => void
  readonly isResourceRejected?: (error: unknown) => boolean
}

export interface CalculationRequestCoordinator<
  TRequest,
  _TResult = unknown,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
> {
  run(
    request: TRequest,
    options?: CalculationCoordinatorOptionsValue<TPlan, TOptions>,
  ): Promise<boolean>
  invalidate(): void
  dispose(): void
  snapshot(): CalculationCoordinatorState
}
