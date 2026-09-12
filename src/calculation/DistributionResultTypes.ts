import type {
  CertifiedProbability,
  CertifiedValue,
} from '../domain/CertifiedValue'

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

export interface ScoreTailCertificate {
  readonly version: number
  readonly kind: 'score-tail-certificate'
  readonly massLowerBound: number
  readonly massUpperBound: number
  readonly lowerBound: number | null
  readonly probabilityErrorBound: number
}

export interface ScoreExpectationCertificate {
  readonly version: number
  readonly kind: 'score-expectation-certificate'
  readonly model: 'dx-max-tail'
  readonly modeledMax: number
  readonly lowerBound: number
  readonly upperBound: number
  readonly residualUpperBound: number
  readonly tailEvaluationErrorBound: number
  readonly fumbleCorrectionErrorBound: number
  readonly residualArithmeticErrorBound: number
  readonly numericalErrorBound: number
}

export interface ScoreTailMomentCertificate {
  readonly version: number
  readonly kind: 'score-tail-moment-certificate'
  readonly model: string
  readonly modeledMax: number
  readonly massUpperBound: number
  readonly firstMomentUpperBound: number
  readonly numericalErrorBound: number
  readonly boundaryContributionUpperBound?: number
  readonly residualUpperBound?: number
  readonly skillContributionUpperBound?: number
  readonly tailEvaluationErrorBound?: number
}

export interface ScoreMetadata extends ModeledDistributionMetadata {
  readonly automaticFailureProbability: number
  readonly scoreTailCertificate: ScoreTailCertificate | null
  readonly scoreTailMomentCertificate: ScoreTailMomentCertificate | null
  readonly scoreExpectationCertificate?: ScoreExpectationCertificate
}

export interface ScoreEnvelope {
  readonly result: DistributionResult
  readonly metadata: ScoreMetadata
}

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

export interface ScoreStatisticsLane {
  readonly expectedValue: CertifiedValue
  readonly successProbability: CertifiedProbability
  readonly automaticFailureProbability: CertifiedProbability
}

export interface ScoreStatistics {
  readonly action: ScoreStatisticsLane
  readonly reaction: ScoreStatisticsLane
}

export interface ScorePair {
  readonly action: ScoreEnvelope
  readonly reaction: ScoreEnvelope
}

export interface DamageStatistics {
  readonly expectedValue: CertifiedValue
  readonly mass: ProbabilityMassSummary
}

export interface DamageExpectationCertificate {
  readonly version: number
  readonly kind: 'damage-expectation-certificate'
  readonly lowerBound: number
  readonly upperBound: number
  readonly explicitFirstMoment?: number
  readonly actionTailContributionUpperBound?: number
  readonly reactionTailContributionUpperBound?: number
  readonly numericalErrorBound: number
}

export interface DamageMetadata extends ModeledDistributionMetadata {
  readonly damageExpectationCertificate: DamageExpectationCertificate | null
}

export interface DamageEnvelope {
  readonly result: DistributionResult
  readonly metadata: DamageMetadata
}

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
