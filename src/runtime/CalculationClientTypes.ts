import type {
  AttackCalculationInput,
  CheckInputSnapshot,
  DisplayRequestSnapshot,
  DifficultyInput,
} from '../domain/CalculationInputs'
import type { BacktrackParams } from '../domain/BacktrackRules'
import type { ScoreInput } from '../domain/InputDomain'
import type {
  AttackCalculationResult,
  BacktrackCalculationResult,
  ScorePair,
  ScoreStatistics,
  TotalDamageResult,
  DistributionEnvelope,
} from '../calculation/DistributionResultTypes'
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
  extends PlannedCalculationOptions<AttackCalculationRangePlan> {}

export interface BacktrackCalculationOptions
  extends PlannedCalculationOptions<BacktrackCalculationRangePlan> {}

/** Client-facing options for aggregation of already-calculated damage values. */
export interface TotalDamageClientOptions
  extends TotalDamageCalculationOptions,
    CalculationRequestOptions {}

export interface CheckCalculationResult {
  readonly score: ScorePair
  readonly scoreStatistics: ScoreStatistics
}

export interface CalculationClient {
  planCheck(
    params: { action: ScoreInput; reaction: ScoreInput },
    difficulty?: DifficultyInput,
    policy?: RangePolicyInput,
  ): CheckCalculationRangePlan
  planAttackCombo(
    params: AttackCalculationInput,
    policy?: RangePolicyInput,
  ): AttackCalculationRangePlan
  planBacktrack(
    params: BacktrackParams,
    policy?: RangePolicyInput,
  ): BacktrackCalculationRangePlan
  calculateCheck(
    params: CheckInputSnapshot['params'],
    difficulty: DifficultyInput,
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
    params: BacktrackParams,
    options?: BacktrackCalculationOptions,
  ): Promise<BacktrackCalculationResult>
}
