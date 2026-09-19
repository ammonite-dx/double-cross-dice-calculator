import type { DamageEnvelope, DamageStatistics } from './DamageResultTypes'
import type { ScorePair, ScoreStatistics } from './ScoreResultTypes'
import type { DistributionResult } from './DistributionResultTypes'

export interface AttackCalculationResult {
  readonly score: ScorePair
  readonly scoreStatistics: ScoreStatistics
  readonly damage: DamageEnvelope
  readonly damageStatistics: DamageStatistics
}

export interface BacktrackCalculationResult {
  readonly [label: string]: DistributionResult
}

export interface TotalDamageResult {
  readonly totalDamage: DamageEnvelope
  readonly totalDamageStatistics: DamageStatistics
}
