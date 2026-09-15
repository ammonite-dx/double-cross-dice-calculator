import type {
  DisplayMode,
  DisplayRequestSnapshot,
} from '../../../domain/CalculationInputs'
import type {
  AttackCalculationRangePlan,
} from '../../../calculation/planning/RangePlannerTypes'
import type {
  DamageEnvelope,
  DamageStatistics,
  ScorePair,
  ScoreStatistics,
} from '../../../calculation/DistributionResultTypes'
import type {
  ChartJsData,
  DisplayFeedbackPlan,
  DisplayRangePlan,
  DistributionDisplay,
  DistributionProjection,
  DistributionProjectionDecision,
  DistributionProjectionStatus,
} from '../../../shared/presentation/DistributionProjectionTypes'

export type AttackComboId = string | number
export type AttackDisplayStatus = DistributionProjectionStatus
export type AttackDisplayDecision = DistributionProjectionDecision

export interface AttackScorePresentation {
  readonly action: DistributionDisplay
  readonly reaction?: DistributionDisplay
}

export interface AttackBatchComboResult {
  readonly id: AttackComboId
  readonly score: ScorePair
  readonly scoreStatistics: ScoreStatistics
  readonly damage: DamageEnvelope
  readonly damageStatistics: DamageStatistics
}

/** Raw batch result accepted by the presentation adapter. */
export interface AttackBatchResult {
  readonly combos: readonly AttackBatchComboResult[]
  readonly totalDamage: DamageEnvelope
  readonly totalDamageStatistics: DamageStatistics
}

export type AttackRangePlanReference =
  | AttackCalculationRangePlan
  | DisplayFeedbackPlan

export interface AttackPresentationCombo {
  readonly id: AttackComboId
  readonly score: ScorePair
  readonly scoreStatistics: ScoreStatistics
  readonly scorePresentation: AttackScorePresentation | null
  readonly damage: DamageEnvelope
  readonly damageStatistics: DamageStatistics
  readonly damagePresentation: DistributionDisplay
  readonly rangePlan: AttackRangePlanReference
}

/** Calculation-owned data plus complete, window-independent display models. */
export interface AttackPresentation {
  readonly combos: readonly AttackPresentationCombo[]
  readonly totalDamage: DamageEnvelope
  readonly totalDamageStatistics: DamageStatistics
  readonly totalDamagePresentation: DistributionDisplay
}

export interface AttackDisplaySide {
  readonly id?: AttackComboId
  readonly display: DistributionDisplay
  readonly projection: DistributionProjection
  readonly plan: DisplayRangePlan
  readonly series: DistributionProjection
  readonly chart: ChartJsData | null
  readonly status: AttackDisplayStatus
  readonly reason: string | null
  readonly decision: AttackDisplayDecision
}

export interface AttackScoreDisplaySidePresentation {
  readonly version: 1
  readonly kind: 'attack-canonical-score-display-presentation'
  readonly status: AttackDisplayStatus
  readonly decision: AttackDisplayDecision
  readonly mode: DisplayMode
  readonly displayRequest: DisplayRequestSnapshot
  readonly action: AttackDisplaySide
  readonly reaction: AttackDisplaySide | null
}

export type AttackScoreDisplayCombo =
  & AttackScoreDisplaySidePresentation
  & {
    readonly id: AttackComboId
    readonly scoreStatistics: ScoreStatistics
  }

export interface AttackScoreDisplayBatchPresentation {
  readonly version: 1
  readonly kind: 'attack-canonical-score-display-presentation'
  readonly status: AttackDisplayStatus
  readonly decision: AttackDisplayDecision
  readonly mode: DisplayMode
  readonly displayRequest: DisplayRequestSnapshot
  readonly combos: readonly (AttackScoreDisplayCombo | null)[]
}

export type AttackScoreDisplayPresentation =
  | AttackScoreDisplaySidePresentation
  | AttackScoreDisplayBatchPresentation

export type AttackDisplayCombo =
  & AttackDisplaySide
  & {
    readonly id: AttackComboId
    readonly rangePlan: AttackRangePlanReference
    readonly score: ScorePair | null
    readonly scoreStatistics: ScoreStatistics | null
    readonly scorePresentation: AttackScorePresentation | null
    readonly scoreDisplay: AttackScoreDisplayCombo | null
  }

export interface AttackDisplayPresentation {
  readonly version: 1
  readonly kind: 'attack-canonical-display-presentation'
  readonly status: AttackDisplayStatus
  readonly decision: AttackDisplayDecision
  readonly mode: DisplayMode
  readonly displayRequest: DisplayRequestSnapshot
  readonly combos: readonly AttackDisplayCombo[]
  readonly total: AttackDisplaySide
  readonly score: AttackScoreDisplayBatchPresentation | null
}
