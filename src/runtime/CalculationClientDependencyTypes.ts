import type {
  DamageAggregationPlan,
  TotalDamageCalculationOptions,
} from '../calculation/DamageAggregationTypes'
import type {
  DxDistribution,
  DxDistributionInput,
  DxDistributionOptions,
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
  NormalizedAttackDamageInput,
  NormalizedBacktrackParams,
  NormalizedDifficultyInput,
  NormalizedScoreInput,
} from '../domain/CalculationInputNormalization'
import type { DefenceDamageInput } from '../domain/CalculationInputs'
import type { BacktrackParams } from '../domain/BacktrackRules'
import type { AggregatedDamageEnvelope } from '../calculation/DamageAggregationTypes'
import type { DamageEnvelope, DamageStatistics } from '../domain/DamageResultTypes'
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

/** Options passed from the client to calculation cores after runtime fields are removed. */
export interface CalculationRuntimeOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  readonly requestMetadata?: Readonly<Record<string, unknown>>
  readonly [key: string]: unknown
}

/** The historical positional provider consumed by ScoreCalculator. */
export type PositionalDxDistributionProvider = (
  shihai: number,
  dice: number,
  critical: number,
  options: NormalizedDxOptions,
  yousei?: number,
) => DxDistribution

/** normalizeDxOptions() guarantees these fields for the cache/provider boundary. */
export interface NormalizedDxOptions {
  readonly workingLength: number
  readonly fftLength?: number
}

export interface DamageCalculationDependencies {
  readonly getDamageRollDistribution?: RuntimeDamageRollClient['calculate']
  readonly getD10Distribution?: (
    dice: number,
    size?: number,
    runtimeOptions?: CalculationRuntimeOptions,
  ) => Float64Array
  readonly onFftLength?: (fftLength: number) => void
}

export type CalculateDamageOnDemand = (
  score: ScorePair,
  attack: NormalizedAttackDamageInput,
  defence: DefenceDamageInput,
  dependencies: DamageCalculationDependencies,
  options: CalculationRuntimeOptions,
  rangePlan: AttackCalculationRangePlan,
) => Promise<DamageEnvelope>

export type CalculateDxDistribution = (
  input: DxDistributionInput,
  options: DxDistributionOptions,
) => DxDistribution

export type CalculateScore = (
  params: NormalizedScoreInput,
  getDistribution?: PositionalDxDistributionProvider,
  scoreRangePlan?: RolledScoreRangePlan,
) => ScoreEnvelope

export type CalculateScoreResolution = (
  resolution: ScoreResolution,
  getDistribution?: PositionalDxDistributionProvider,
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

export type PlanDamageAggregation = (
  damages: readonly DistributionEnvelope[],
  options?: TotalDamageCalculationOptions,
) => DamageAggregationPlan

export type SumDamage = (
  damages: readonly DistributionEnvelope[],
  options?: TotalDamageCalculationOptions & Readonly<{
    plan?: DamageAggregationPlan
  }>,
  explicitPlan?: DamageAggregationPlan,
) => AggregatedDamageEnvelope

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
  readonly planDamageAggregation?: PlanDamageAggregation
  readonly planCalculationRanges?: PlanCalculationRanges
  readonly resourceGuard?: ResourceGuard
  readonly sumDamage?: SumDamage
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
  readonly planDamageAggregation: PlanDamageAggregation
  readonly planCalculationRanges: PlanCalculationRanges
  readonly resourceGuard: ResourceGuard
  readonly sumDamage: SumDamage
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
