import type {
  AttackCalculationOptions,
} from '../../../runtime/CalculationClientTypes'
import type {
  CalculationRangePlan,
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
  AttackIncrementalExecution,
} from './AttackIncrementalExecutionTypes'
import type { AttackState } from './AttackStateTypes'

export type AttackRunnerPresentation =
  | AttackPresentation
  | AttackDisplayPresentation

export interface AttackRunnerCalculationRequest {
  readonly entries: readonly AttackExecutionEntry[]
  readonly calculationOptions: AttackCalculationOptions
  readonly signal?: AbortSignal
  readonly onRangePlan?: (plan: CalculationRangePlan) => void
  readonly forceAll?: boolean
}

export interface AttackRunnerDisplayContext {
  readonly state: AttackState
  readonly generation?: number | null
  readonly batchResult?: AttackBatchResult
  readonly rangePlans?: readonly AttackRangePlanReference[]
  readonly basePresentation?: AttackPresentation | null
  readonly displayRequest?: DisplayRequestSnapshot
  readonly scoreDisplayRequest?: DisplayRequestSnapshot
  readonly scoreOnly?: boolean
  readonly calculationOptions?: AttackCalculationOptions
}

export type AttackRunnerRefreshOptions = Omit<
  AttackRunnerDisplayContext,
  'state' | 'generation' | 'batchResult' | 'rangePlans' | 'basePresentation'
>

export interface AttackRunnerRunOptions
  extends Omit<AttackCalculationOptions, 'signal' | 'onRangePlan'> {
  readonly signal?: AbortSignal
  readonly onRangePlan?: (plan: CalculationRangePlan) => void
  readonly displayRequest?: DisplayRequestSnapshot | null
  readonly displayRequestGeneration?: number
  readonly scoreDisplayRequest?: DisplayRequestSnapshot | null
  readonly scoreDisplayRequestGeneration?: number
  readonly scoreDisplayEnabled?: boolean
  readonly preserveResult?: boolean
  readonly forceAll?: boolean
}

export interface AttackRunnerOptions<
  TPresentation extends AttackRunnerPresentation = AttackRunnerPresentation,
> {
  readonly state: AttackState
  readonly executeCalculation: (
    request: AttackRunnerCalculationRequest,
  ) => Promise<AttackIncrementalExecution>
  readonly createBasePresentation?: (
    batchResult: AttackBatchResult,
    rangePlans?: readonly AttackRangePlanReference[],
  ) => AttackPresentation
  readonly createPresentation?: (
    batchResult: AttackBatchResult,
    rangePlans?: readonly AttackRangePlanReference[],
    displayRequest?: DisplayRequestSnapshot,
    scoreDisplayRequest?: DisplayRequestSnapshot,
  ) => TPresentation
  readonly createDisplayPresentation?: (
    context: AttackRunnerDisplayContext,
  ) => AttackDisplayPresentation
  readonly onPresentation?: (
    presentation: TPresentation,
    metadata?: Readonly<{ scoreDisplaySuppressed?: boolean }>,
  ) => void
  readonly onDisplayRejected?: (
    presentation: TPresentation | null,
  ) => void
  readonly onError?: (error: unknown) => void
}

export interface AttackRunner<
  TPresentation extends AttackRunnerPresentation = AttackRunnerPresentation,
> {
  run(options?: AttackRunnerRunOptions): Promise<boolean>
  invalidate(): void
  invalidateScoreDisplay(): void
  refreshPresentation(options?: AttackRunnerRefreshOptions): boolean
  dispose(): void
}
