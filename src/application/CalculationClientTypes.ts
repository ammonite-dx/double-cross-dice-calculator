import type { InjectionKey } from 'vue'

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
  CanonicalDamageEnvelope,
  CanonicalDamageSummary,
  CanonicalScorePair,
  CanonicalScoreSummary,
  CanonicalTotalDamageResult,
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
  readonly score: CanonicalScorePair
  readonly scoreSummary: CanonicalScoreSummary
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
  calculateCheckCanonical(
    params: CheckInputSnapshot['params'],
    difficulty: DifficultyInput,
    options?: CalculationOptions,
  ): Promise<CheckCalculationResult>
  calculateAttackCanonical(
    params: AttackCalculationInput,
    options?: CalculationOptions,
  ): Promise<AttackCalculationResult>
  calculateAttackCanonicalBatch(
    entries: readonly AttackBatchEntry[],
    options?: CalculationOptions,
  ): Promise<{
    readonly combos: readonly (AttackCalculationResult & { id: string | number })[]
    readonly canonicalTotalDamage: CanonicalDamageEnvelope
    readonly canonicalTotalDamageSummary: CanonicalDamageSummary
  }>
  calculateCanonicalTotalDamage(
    canonicalDamages: readonly DistributionEnvelope[],
    options?: CalculationOptions,
  ): Promise<CanonicalTotalDamageResult>
  calculateBacktrackCanonical(
    params: BacktrackParams,
    options?: CalculationOptions,
  ): Promise<BacktrackCalculationResult>
}

export const CALCULATION_CLIENT_KEY: InjectionKey<CalculationClient> =
  Symbol('calculationClient')
