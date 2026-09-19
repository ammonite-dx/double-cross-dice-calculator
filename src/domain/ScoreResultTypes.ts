import type {
  CertifiedProbability,
  CertifiedValue,
} from './CertifiedValue'
import type {
  DistributionResult,
  ModeledDistributionMetadata,
} from './DistributionResultTypes'

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
}

interface ScoreTailMomentCertificateBase {
  readonly version: number
  readonly kind: 'score-tail-moment-certificate'
  readonly modeledMax: number
  readonly massUpperBound: number
  readonly firstMomentUpperBound: number
}

export interface FiniteSupportScoreTailMomentCertificate
  extends ScoreTailMomentCertificateBase {
  readonly model: 'finite-support'
}

export interface AnalyticScoreTailMomentCertificate
  extends ScoreTailMomentCertificateBase {
  readonly model:
    | 'dx-max-tail'
    | 'dx-max-domination'
    | 'dx-yousei-tail'
  readonly boundaryContributionUpperBound: number
  readonly residualUpperBound: number
  readonly skillContributionUpperBound: number
}

export type ScoreTailMomentCertificate =
  | FiniteSupportScoreTailMomentCertificate
  | AnalyticScoreTailMomentCertificate

export interface ScoreMetadata extends ModeledDistributionMetadata {
  readonly forcedFailureProbability: number
  readonly scoreTailCertificate: ScoreTailCertificate | null
  readonly scoreTailMomentCertificate: ScoreTailMomentCertificate | null
  readonly scoreExpectationCertificate?: ScoreExpectationCertificate
}

export interface ScoreEnvelope {
  readonly result: DistributionResult
  readonly metadata: ScoreMetadata
}

export interface ScorePair {
  readonly action: ScoreEnvelope
  readonly reaction: ScoreEnvelope
}

export interface ScoreStatisticsLane {
  readonly expectedValue: CertifiedValue
  readonly successProbability: CertifiedProbability
  readonly forcedFailureProbability: CertifiedProbability
}

export interface ScoreStatistics {
  readonly action: ScoreStatisticsLane
  readonly reaction: ScoreStatisticsLane
}
