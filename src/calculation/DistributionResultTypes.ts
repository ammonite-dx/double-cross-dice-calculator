export type DistributionSupport =
  | Readonly<{ kind: 'finite'; max: number }>
  | Readonly<{ kind: 'infinite' }>

export type DistributionOverflow =
  | Readonly<{
      kind: 'exact'
      lowerBound: number
      probability: number
      errorBound: number
    }>
  | Readonly<{
      kind: 'upper-bound'
      lowerBound: number
      probabilityUpperBound: number
      errorBound: number
    }>

export interface DistributionResult {
  readonly version: number
  readonly values: Float64Array
  readonly offset: number
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
}

export interface ModeledDistributionMetadata {
  readonly modeledDistribution: true
  readonly [key: string]: unknown
}

export interface DistributionEnvelope {
  readonly result: DistributionResult
  readonly metadata: ModeledDistributionMetadata
}

export type ScoreEnvelope = DistributionEnvelope
export type DamageEnvelope = DistributionEnvelope

export interface ProbabilityMassSummary {
  readonly explicitMass: number
  readonly overflowMass: number | null
  readonly overflowMassUpperBound: number
  readonly totalMass: number | null
  readonly totalMassUpperBound: number
  readonly unrepresentedMass: number | null
  readonly unrepresentedMassUpperBound: number
  readonly errorBound: number
  readonly isExact: boolean
}

export type ExpectedValueSummary =
  | Readonly<{ kind: 'exact'; value: number }>
  | Readonly<{ kind: 'bounded'; lowerBound: number; upperBound: number }>
  | Readonly<{ kind: 'lower-bound'; lowerBound: number }>

export interface ScoreRateSummaryExact {
  readonly kind: 'exact'
  readonly value: number
}

export interface ScoreRateSummaryBounded {
  readonly kind: 'bounded'
  readonly lowerBound: number
  readonly upperBound: number
}

export type ScoreRateSummary =
  | ScoreRateSummaryExact
  | ScoreRateSummaryBounded

export interface ScoreSummaryLane {
  readonly expectedValue: ExpectedValueSummary
  readonly successRate: ScoreRateSummary
}

export interface ScoreSummary {
  readonly action: ScoreSummaryLane
  readonly reaction: ScoreSummaryLane
}

export interface ScorePair {
  readonly action: ScoreEnvelope
  readonly reaction: ScoreEnvelope
}

export interface DamageSummary {
  readonly expectedValue: ExpectedValueSummary
  readonly mass: ProbabilityMassSummary
}

export interface AttackCalculationResult {
  readonly score: ScorePair
  readonly scoreSummary: ScoreSummary
  readonly damage: DamageEnvelope
  readonly damageSummary: DamageSummary
}

export interface BacktrackCalculationResult {
  readonly [label: string]: DistributionResult
}

export interface TotalDamageResult {
  readonly totalDamage: DamageEnvelope
  readonly totalDamageSummary: DamageSummary
}
