import type { CertifiedValue } from './CertifiedValue'
import type {
  DistributionResult,
  ProbabilityMassSummary,
  ModeledDistributionMetadata,
} from './DistributionResultTypes'

export interface DamageExpectationCertificate {
  readonly version: number
  readonly kind: 'damage-expectation-certificate'
  readonly lowerBound: number
  readonly upperBound: number
  readonly explicitFirstMoment?: number
  readonly actionTailContributionUpperBound?: number
  readonly reactionTailContributionUpperBound?: number
  readonly maxDamageConstant?: number
}

export interface DamageMetadata extends ModeledDistributionMetadata {
  readonly damageExpectationCertificate: DamageExpectationCertificate | null
}

export interface DamageEnvelope {
  readonly result: DistributionResult
  readonly metadata: DamageMetadata
}

export interface DamageStatistics {
  readonly expectedValue: CertifiedValue
  readonly mass: ProbabilityMassSummary
}
