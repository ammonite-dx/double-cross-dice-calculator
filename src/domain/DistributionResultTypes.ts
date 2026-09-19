/** Generic result contracts shared by calculation, runtime, and presentation. */
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
