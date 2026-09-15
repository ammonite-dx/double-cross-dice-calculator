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
  CalculationRangePlan,
  CheckCalculationRangePlan,
  RangePolicyInput,
} from '../calculation/planning/RangePlannerTypes'

export interface CalculationOptions extends TotalDamageCalculationOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  readonly rangePolicy?: RangePolicyInput
  readonly displayRequest?: DisplayRequestSnapshot
  readonly onRangePlan?: (plan: CalculationRangePlan) => void
  /** Metadata is passed through the application runner and is not interpreted by the client. */
  readonly requestMetadata?: Readonly<Record<string, unknown>>
}

export interface CheckCalculationOptions extends CalculationOptions {}

export interface AttackCalculationOptions extends CalculationOptions {
  readonly scoreDisplayRequest?: DisplayRequestSnapshot
}

export interface BacktrackCalculationOptions extends CalculationOptions {}

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
    options?: TotalDamageCalculationOptions,
  ): Promise<TotalDamageResult>
  calculateBacktrack(
    params: BacktrackParams,
    options?: BacktrackCalculationOptions,
  ): Promise<BacktrackCalculationResult>
}
