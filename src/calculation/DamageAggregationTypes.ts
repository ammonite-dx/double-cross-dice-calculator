import type {
  DistributionEnvelope,
  DistributionSupport,
} from '../domain/DistributionResultTypes'

export interface TotalDamageCalculationOptions {
  readonly maxValuesLength?: number
  readonly maxFftLength?: number
  readonly maxResourceBytes?: number
  readonly maxComponents?: number
  readonly signal?: AbortSignal
  readonly onFftLength?: (fftLength: number) => void
}

export interface DamageAggregationPlanStep {
  readonly index: number
  readonly leftLength: number
  readonly rightLength: number
  readonly outputLength: number
  readonly fftLength: number
  readonly resourceBytes: number
  readonly operations: number
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
