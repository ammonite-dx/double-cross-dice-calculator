import type { CalculationRangePlan } from '../calculation/planning/RangePlannerTypes'

export type CalculationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'rejected'
  | 'error'

export interface CalculationFeedbackState<TPlan = CalculationRangePlan> {
  status: CalculationStatus
  plan: TPlan | null
  error: unknown
}

export interface CalculationRunnerContext<
  TRequest,
  TPlan = CalculationRangePlan,
  TOptions = Record<string, unknown>,
> {
  readonly revision: number
  readonly request: TRequest
  readonly signal: AbortSignal | null | undefined
  readonly options: TOptions
  readonly onRangePlan: (plan: TPlan) => void
}

export interface CalculationCoordinatorState {
  readonly status: string
  readonly revision: number
  readonly activeRevision: number | null
  readonly queuedRevision: number | null
  readonly disposed: boolean
}

export interface CalculationCoordinatorOptions<
  TRequest,
  TResult,
  TPlan = CalculationRangePlan,
  TOptions = Record<string, unknown>,
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
    context: CalculationRunnerContext<TRequest, TPlan, TOptions>,
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
    context?: CalculationRunnerContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onCancelled?: (
    context: CalculationRunnerContext<TRequest, TPlan, TOptions>,
  ) => void
  readonly onStateChange?: (state: CalculationCoordinatorState) => void
  readonly isResourceRejected?: (error: unknown) => boolean
}

export interface CalculationRequestCoordinator<
  TRequest,
  TResult = unknown,
  TPlan = CalculationRangePlan,
  TOptions = Record<string, unknown>,
> {
  run(
    request: TRequest,
    options?: TOptions,
  ): Promise<boolean>
  invalidate(): void
  dispose(): void
  snapshot(): CalculationCoordinatorState
}

export interface LatestCalculationRunner<
  TRequest,
  TResult = unknown,
  TPlan = CalculationRangePlan,
  TOptions = Record<string, unknown>,
> {
  run(
    request?: TRequest,
    options?: TOptions,
  ): Promise<boolean>
  invalidate(): void
  dispose(): void
  snapshot(): CalculationCoordinatorState
}
