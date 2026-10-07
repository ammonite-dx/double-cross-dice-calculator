import type {
  AttackCalculationInput,
  CheckCalculationInput,
  DisplayRequestSnapshot,
} from '../domain/CalculationInputs'
import type { BacktrackParams } from '../domain/BacktrackRules'
import type {
  AttackCalculationResult,
  BacktrackCalculationResult,
  TotalDamageResult,
} from '../domain/CalculationResultTypes'
import type { DistributionEnvelope } from '../domain/DistributionResultTypes'
import type {
  ScoreEnvelope,
  ScorePair,
  ScoreStatistics,
  ScoreStatisticsLane,
} from '../domain/ScoreResultTypes'
import type {
  TotalDamageCalculationOptions,
} from '../calculation/DamageAggregationTypes'
import type {
  AttackCalculationRangePlan,
  BacktrackCalculationRangePlan,
  CheckCalculationRangePlan,
  RangePolicyInput,
} from '../calculation/planning/RangePlannerTypes'

/** Options shared by caller-facing calculation requests. */
export interface CalculationRequestOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  /** Metadata owned by an application runner and ignored by the client. */
  readonly requestMetadata?: Readonly<Record<string, unknown>>
}

/** Options shared by calculations that publish a range plan. */
export interface PlannedCalculationOptions<TPlan>
  extends CalculationRequestOptions {
  readonly rangePolicy?: RangePolicyInput
  readonly onRangePlan?: (plan: TPlan) => void
}

export interface CheckCalculationOptions
  extends PlannedCalculationOptions<CheckCalculationRangePlan> {
  readonly displayRequest?: DisplayRequestSnapshot
}

export interface AttackCalculationOptions
  extends PlannedCalculationOptions<AttackCalculationRangePlan> {
  readonly scoreDisplayRequest?: DisplayRequestSnapshot
}

export interface BacktrackCalculationOptions
  extends PlannedCalculationOptions<BacktrackCalculationRangePlan> {}

/** Client-facing options for aggregation of already-calculated damage values. */
export interface TotalDamageClientOptions
  extends TotalDamageCalculationOptions,
    CalculationRequestOptions {}

export type CheckCalculationResult =
  | {
      readonly kind: 'fixed'
      readonly score: { readonly action: ScoreEnvelope }
      readonly scoreStatistics: { readonly action: ScoreStatisticsLane }
    }
  | {
      readonly kind: 'opposed'
      readonly score: ScorePair
      readonly scoreStatistics: ScoreStatistics
    }

export interface CalculationClient {
  planCheck(
    input: CheckCalculationInput,
    policy?: RangePolicyInput,
  ): CheckCalculationRangePlan
  planAttackCombo(
    params: AttackCalculationInput,
    policy?: RangePolicyInput,
  ): AttackCalculationRangePlan
  planBacktrack(
    params: Partial<BacktrackParams>,
    policy?: RangePolicyInput,
  ): BacktrackCalculationRangePlan
  calculateCheck(
    input: CheckCalculationInput,
    options?: CheckCalculationOptions,
  ): Promise<CheckCalculationResult>
  calculateAttack(
    params: AttackCalculationInput,
    options?: AttackCalculationOptions,
  ): Promise<AttackCalculationResult>
  calculateTotalDamage(
    damages: readonly DistributionEnvelope[],
    options?: TotalDamageClientOptions,
  ): Promise<TotalDamageResult>
  calculateBacktrack(
    params: Partial<BacktrackParams>,
    options?: BacktrackCalculationOptions,
  ): Promise<BacktrackCalculationResult>
}
