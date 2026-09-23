import type {
  DamageAggregationPlan,
  PreparedDamageAggregation,
  TotalDamageCalculationOptions,
} from '../calculation/DamageAggregationTypes'
import type {
  DxDistribution,
  DxDistributionInput,
  DxDistributionOptions,
  DxDistributionProvider,
} from '../calculation/DxProviderTypes'
import type {
  AttackCalculationRangePlan,
  BacktrackCalculationRangePlan,
  BacktrackRangePlan,
  CalculationRangePlan,
  CheckCalculationRangePlan,
  RangePlannerParams,
  RangePolicyInput,
  RolledScoreRangePlan,
  ScoreRangePlan,
} from '../calculation/planning/RangePlannerTypes'
import type {
  NormalizedBacktrackParams,
  NormalizedDifficultyInput,
  NormalizedScoreInput,
} from '../domain/CalculationInputNormalization'
import type { BacktrackParams } from '../domain/BacktrackRules'
import type { DamageStatistics } from '../domain/DamageResultTypes'
import type { DistributionEnvelope } from '../domain/DistributionResultTypes'
import type {
  ScoreEnvelope,
  ScorePair,
  ScoreStatistics,
} from '../domain/ScoreResultTypes'
import type { ScoreResolution } from '../domain/ScoreResolution'
import type { BacktrackCalculationResult } from '../domain/CalculationResultTypes'
import type { ResourceGuard } from './ResourceGuardTypes'
import type { RuntimeDamageRollClient } from './RuntimeDamageRollClientTypes'
import type {
  CalculationRuntimeOptions,
  CalculateDamageOnDemand,
  DamageCalculationDependencies,
} from '../calculation/CalculationRuntimeTypes'

export type {
  CalculationRuntimeOptions,
  CalculateDamageOnDemand,
  DamageCalculationDependencies,
} from '../calculation/CalculationRuntimeTypes'

/** normalizeDxOptions() guarantees these fields for the cache/provider boundary. */
export interface NormalizedDxOptions {
  readonly workingLength: number
  readonly fftLength?: number
}

export type CalculateDxDistribution = (
  input: DxDistributionInput,
  options: DxDistributionOptions,
) => DxDistribution

export type CalculateScore = (
  params: NormalizedScoreInput,
  getDistribution?: DxDistributionProvider,
  scoreRangePlan?: RolledScoreRangePlan,
) => ScoreEnvelope

export type CalculateScoreResolution = (
  resolution: ScoreResolution,
  getDistribution?: DxDistributionProvider,
  scoreRangePlan?: ScoreRangePlan,
) => ScoreEnvelope

export type GetScoreStatistics = (
  score: ScorePair,
  difficulty?: NormalizedDifficultyInput,
) => ScoreStatistics

export type GetDamageStatistics = (damage: unknown) => DamageStatistics

export type GetTotalDamageStatistics = (damage: unknown) => DamageStatistics

export type GetFinalEncroachment = (
  params: BacktrackParams,
  runtimeOptions?: CalculationRuntimeOptions,
  backtrackRangePlan?: BacktrackCalculationRangePlan['backtrack'],
) => BacktrackCalculationResult

export type GetD10Distribution = (
  dice: number,
  size?: number,
  runtimeOptions?: CalculationRuntimeOptions,
) => Float64Array

export type PrepareDamageAggregation = (
  damages: readonly DistributionEnvelope[],
  options?: TotalDamageCalculationOptions,
) => PreparedDamageAggregation

export type PlanCalculationRanges = (
  params: RangePlannerParams,
  policy?: RangePolicyInput,
) => CalculationRangePlan

export interface CalculationClientDependencies {
  readonly calculateDamageOnDemand?: CalculateDamageOnDemand
  readonly calculateDxDistribution?: CalculateDxDistribution
  readonly calculateScore?: CalculateScore
  readonly calculateScoreResolution?: CalculateScoreResolution
  readonly getScoreStatistics?: GetScoreStatistics
  readonly getDamageStatistics?: GetDamageStatistics
  readonly getTotalDamageStatistics?: GetTotalDamageStatistics
  readonly getDamageRollDistribution?: RuntimeDamageRollClient['calculate']
  readonly getFinalEncroachment?: GetFinalEncroachment
  readonly getD10Distribution?: GetD10Distribution
  readonly prepareDamageAggregation?: PrepareDamageAggregation
  readonly planCalculationRanges?: PlanCalculationRanges
  readonly resourceGuard?: ResourceGuard
  readonly onFftLength?: (fftLength: number) => void
}

export type CalculationClientDependencyOverrides =
  Partial<CalculationClientDependencies>

/** The complete bundle returned by createCalculationDependencies(). */
export interface CompleteCalculationClientDependencies
  extends CalculationClientDependencies {
  readonly calculateDamageOnDemand: CalculateDamageOnDemand
  readonly calculateDxDistribution: CalculateDxDistribution
  readonly calculateScore: CalculateScore
  readonly calculateScoreResolution: CalculateScoreResolution
  readonly getScoreStatistics: GetScoreStatistics
  readonly getDamageStatistics: GetDamageStatistics
  readonly getTotalDamageStatistics: GetTotalDamageStatistics
  readonly getDamageRollDistribution: RuntimeDamageRollClient['calculate']
  readonly getFinalEncroachment: GetFinalEncroachment
  readonly getD10Distribution: GetD10Distribution
  readonly prepareDamageAggregation: PrepareDamageAggregation
  readonly planCalculationRanges: PlanCalculationRanges
  readonly resourceGuard: ResourceGuard
}

export type CalculationClientResourcePlan =
  | CalculationRangePlan
  | DamageAggregationPlan

export type CalculationLeaseOperation =
  | 'check'
  | 'attack'
  | 'backtrack'
  | 'total-damage'

export type CalculationLeasePlan =
  | CheckCalculationRangePlan
  | AttackCalculationRangePlan
  | BacktrackCalculationRangePlan
  | DamageAggregationPlan

export type CalculationClientRequestOptions = CalculationRuntimeOptions
