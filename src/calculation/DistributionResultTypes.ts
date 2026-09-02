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

export type CanonicalScoreEnvelope = DistributionEnvelope
export type CanonicalDamageEnvelope = DistributionEnvelope

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

export interface CanonicalScoreRateSummaryExact {
  readonly kind: 'exact'
  readonly value: number
}

export interface CanonicalScoreRateSummaryBounded {
  readonly kind: 'bounded'
  readonly lowerBound: number
  readonly upperBound: number
}

export type CanonicalScoreRateSummary =
  | CanonicalScoreRateSummaryExact
  | CanonicalScoreRateSummaryBounded

export interface CanonicalScoreSummaryLane {
  readonly expectedValue: ExpectedValueSummary
  readonly successRate: CanonicalScoreRateSummary
}

export interface CanonicalScoreSummary {
  readonly action: CanonicalScoreSummaryLane
  readonly reaction: CanonicalScoreSummaryLane
}

export interface CanonicalScorePair {
  readonly action: CanonicalScoreEnvelope
  readonly reaction: CanonicalScoreEnvelope
}

export interface CanonicalDamageSummary {
  readonly expectedValue: ExpectedValueSummary
  readonly mass: ProbabilityMassSummary
}

export interface AttackCalculationResult {
  readonly score: CanonicalScorePair
  readonly scoreSummary: CanonicalScoreSummary
  readonly canonicalScore: CanonicalScorePair
  readonly canonicalScoreBatchSummary: CanonicalScoreSummary
  readonly canonicalDamage: CanonicalDamageEnvelope
  readonly canonicalDamageSummary: CanonicalDamageSummary
}

export interface BacktrackCalculationResult {
  readonly [label: string]: DistributionResult
}

export interface CanonicalTotalDamageResult {
  readonly canonicalTotalDamage: CanonicalDamageEnvelope
  readonly canonicalTotalDamageSummary: CanonicalDamageSummary
}
