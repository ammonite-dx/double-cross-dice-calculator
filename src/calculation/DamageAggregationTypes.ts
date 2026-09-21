import type {
  DistributionOverflow,
  DistributionEnvelope,
  DistributionResult,
  DistributionSupport,
} from '../domain/DistributionResultTypes'
import type {
  DamageExpectationCertificate,
  DamageMetadata,
} from '../domain/DamageResultTypes'

export interface TotalDamageCalculationOptions {
  readonly maxValuesLength?: number
  readonly maxFftLength?: number
  readonly maxResourceBytes?: number
  readonly maxComponents?: number
  readonly signal?: AbortSignal
  readonly onFftLength?: (fftLength: number) => void
}

export interface DamageAggregationExecutionOptions {
  readonly signal?: AbortSignal
  readonly onFftLength?: (fftLength: number) => void
}

export interface DamageAggregationPlanStep {
  readonly index: number
  readonly leftLength: number
  readonly rightLength: number
  readonly resultLength: number
  readonly fftLength: number
  readonly resourceBytes: number
}

export interface DamageAggregationPlanEstimates {
  readonly float64Bytes: number
  readonly operations: number
  readonly cpuWork: number
  readonly persistentBytes: number
  readonly peakResourceBytes: number
  readonly fftLengths: readonly number[]
}

export interface DamageAggregationPlan {
  readonly version: number
  readonly operation: 'damage-aggregation'
  readonly componentCount: number
  readonly outputLength: number
  readonly offset: number
  readonly modeledSupport: DistributionSupport
  readonly sourceSupport: DistributionSupport
  readonly steps: readonly DamageAggregationPlanStep[]
  readonly estimates: DamageAggregationPlanEstimates
}

export type DamageAggregationInput = readonly DistributionEnvelope[]

export interface DamageProjectionUncertainty {
  readonly positionUnknownProbabilityUpperBound: number
  readonly outputOverflowLowerBound?: number | null
}

export interface DamageComponentDescriptor {
  readonly index: number
  readonly offset: number
  readonly valuesLength: number
  readonly modeledSupport: DistributionSupport
  readonly sourceSupport: DistributionSupport
  readonly overflow: DistributionOverflow | null
  readonly projectionUncertainty?: DamageProjectionUncertainty
}

export interface AggregatedDamageMetadata extends DamageMetadata {
  readonly aggregation: 'independent-sum'
  readonly independence: 'assumed'
  readonly componentCount: number
  readonly modeledSupport: DistributionSupport
  readonly sourceSupport: DistributionSupport
  readonly overflowProbabilityLowerBound: number
  readonly aggregationErrorBound: number
  readonly componentDescriptors: readonly DamageComponentDescriptor[]
  readonly sourceOverflowProbability: number | null
  readonly sourceOverflowProbabilityUpperBound: number
  readonly expectedExplicitMass: number
  readonly rawExplicitMass: number
  readonly explicitMass: number
  readonly sourceErrorBound: number
  readonly fftMassDrift: number
  readonly sourceMassDrift: number
  readonly damageExpectationCertificate: DamageExpectationCertificate | null
  readonly projectionUncertainty?: DamageProjectionUncertainty
}

export interface AggregatedDamageEnvelope {
  readonly result: DistributionResult
  readonly metadata: AggregatedDamageMetadata
}

export interface PreparedDamageAggregation {
  readonly plan: DamageAggregationPlan
  readonly execute: (
    options?: DamageAggregationExecutionOptions,
  ) => AggregatedDamageEnvelope
}

export interface InspectedDamageComponent {
  readonly index: number
  readonly result: DistributionResult
  readonly values: Float64Array
  readonly offset: number
  readonly explicitMass: number
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
  readonly sourceSupport: DistributionSupport
  readonly projectionUncertainty: DamageProjectionUncertainty | null
  readonly expectedValueInterval: {
    readonly lowerBound: number
    readonly upperBound: number
    readonly source: string
  } | null
}

export interface DamageAggregationInternalPlan {
  readonly offset: number
  readonly modeledSupport: DistributionSupport
  readonly sourceSupport: DistributionSupport
  readonly sourceErrorBound: number
  readonly expectedExplicitMass: number
  readonly exactUnion: number
  readonly upperUnion: number
  readonly allOverflowNull: boolean
  readonly hasUpperBound: boolean
  readonly potentialOverflowLowerBound: number
  readonly hasEmptyValues: boolean
  readonly outputLength: number
  readonly persistentBytes: number
  readonly peakResourceBytes: number
  readonly operations: number
  readonly cpuWork: number
  readonly steps: readonly DamageAggregationPlanStep[]
}

export interface PreparedDamageAggregationState {
  readonly inspected: readonly InspectedDamageComponent[]
  readonly plan: DamageAggregationInternalPlan
  readonly executionDefaults: Readonly<{
    signal: AbortSignal | null
    onFftLength?: (fftLength: number) => void
  }>
}

export interface DamageAggregationExecutionDiagnostics {
  readonly aggregationErrorBound: number
  readonly rawExplicitMass: number
  readonly explicitMass: number
  readonly fftMassDrift: number
  readonly sourceMassDrift: number
}
