import type {
  AttackBatchEntry,
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
  DamageEnvelope,
  DamageSummary,
  ScorePair,
  ScoreSummary,
  TotalDamageResult,
  DistributionEnvelope,
} from '../calculation/DistributionResultTypes'

export interface CalculationOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  readonly rangePolicy?: unknown
  readonly displayRequest?: DisplayRequestSnapshot
  readonly onRangePlan?: (plan: unknown) => void
  readonly [key: string]: unknown
}

export interface CheckCalculationResult {
  readonly score: ScorePair
  readonly scoreSummary: ScoreSummary
}

export interface CalculationClient {
  planCheck(
    params: { action: ScoreInput; reaction: ScoreInput },
    difficulty?: DifficultyInput,
    policy?: unknown,
  ): unknown
  planAttackCombo(
    params: AttackCalculationInput,
    policy?: unknown,
  ): unknown
  planBacktrack(params: BacktrackParams, policy?: unknown): unknown
  calculateCheck(
    params: CheckInputSnapshot['params'],
    difficulty: DifficultyInput,
    options?: CalculationOptions,
  ): Promise<CheckCalculationResult>
  calculateAttack(
    params: AttackCalculationInput,
    options?: CalculationOptions,
  ): Promise<AttackCalculationResult>
  calculateAttackBatch(
    entries: readonly AttackBatchEntry[],
    options?: CalculationOptions,
  ): Promise<{
    readonly combos: readonly (AttackCalculationResult & { id: string | number })[]
    readonly totalDamage: DamageEnvelope
    readonly totalDamageSummary: DamageSummary
  }>
  calculateTotalDamage(
    damages: readonly DistributionEnvelope[],
    options?: CalculationOptions,
  ): Promise<TotalDamageResult>
  calculateBacktrack(
    params: BacktrackParams,
    options?: CalculationOptions,
  ): Promise<BacktrackCalculationResult>
}
