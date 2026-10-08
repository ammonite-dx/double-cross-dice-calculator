import type {
  AttackCalculationOptions,
} from '../../../runtime/CalculationClientTypes'
import type {
  AttackCalculationRangePlan,
} from '../../../calculation/planning/RangePlannerTypes'
import type {
  DisplayRequestSnapshot,
} from '../../../domain/CalculationInputs'
import type {
  AttackBatchResult,
  AttackDisplayPresentation,
  AttackPresentation,
  AttackRangePlanReference,
} from './AttackPresentationTypes'
import type {
  AttackExecutionEntry,
  AttackCommittedRecord,
  AttackIncrementalExecution,
} from './AttackIncrementalExecutionTypes'
import type { AttackState } from './AttackStateTypes'

export interface AttackRunnerCalculationRequest {
  readonly entries: readonly AttackExecutionEntry[]
  readonly committedRecords: readonly AttackCommittedRecord[]
  readonly calculationOptions: AttackCalculationOptions
  readonly signal?: AbortSignal
  readonly scoreDisplayRequest?: DisplayRequestSnapshot | null
  readonly onRangePlan?: (plan: AttackCalculationRangePlan) => void
  readonly forceAll?: boolean
}

/** Immutable request data captured before a coordinator lane starts work. */
export interface AttackRunnerRequestSnapshot
  extends AttackRunnerCalculationRequest {
  readonly displayRequest: DisplayRequestSnapshot | null
  readonly scoreDisplayRequest: DisplayRequestSnapshot | null
  readonly displayRevision: number | null
  readonly scoreDisplayRevision: number | null
  readonly preservePresentation: boolean
}

export interface AttackPresentationProjectionRequest {
  readonly displayRequest?: DisplayRequestSnapshot
  readonly scoreDisplayRequest?: DisplayRequestSnapshot
}

export interface AttackRunnerRefreshOptions
  extends AttackPresentationProjectionRequest {
  readonly scoreOnly?: boolean
  readonly calculationOptions?: AttackCalculationOptions
}

export interface AttackRunnerRunOptions
  extends Omit<
    AttackCalculationOptions,
    'signal' | 'onRangePlan' | 'scoreDisplayRequest'
  > {
  readonly signal?: AbortSignal
  readonly onRangePlan?: (plan: AttackCalculationRangePlan) => void
  readonly displayRequest?: DisplayRequestSnapshot | null
  readonly scoreDisplayRequest?: DisplayRequestSnapshot | null
  readonly forceAll?: boolean
}

export interface AttackRunnerOptions {
  readonly state: AttackState
  readonly executeCalculation: (
    request: AttackRunnerCalculationRequest,
  ) => Promise<AttackIncrementalExecution>
  readonly createBasePresentation?: (
    batchResult: AttackBatchResult,
    rangePlans?: readonly AttackRangePlanReference[],
  ) => AttackPresentation
  readonly projectPresentation?: (
    basePresentation: AttackPresentation,
    request: AttackPresentationProjectionRequest,
  ) => AttackDisplayPresentation
  readonly onPresentation?: (
    presentation: AttackDisplayPresentation,
    metadata?: Readonly<{ scoreDisplaySuppressed?: boolean }>,
  ) => void
  readonly onDisplayRejected?: (
    presentation: AttackDisplayPresentation | null,
  ) => void
  readonly onError?: (error: unknown) => void
}

export interface AttackRunner {
  run(options?: AttackRunnerRunOptions): Promise<boolean>
  invalidate(): void
  invalidateForValidation(): void
  invalidateScoreDisplay(): void
  refreshPresentation(
    options?: AttackRunnerRefreshOptions,
  ): boolean | Promise<boolean>
  dispose(): void
}
