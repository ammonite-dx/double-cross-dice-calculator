export interface DxDistributionInput {
  readonly shihai: number
  readonly dice: number
  readonly critical: number
  readonly yousei?: number
}

export interface DxDistributionOptions {
  readonly workingLength?: number
  readonly fftLength?: number
}

export type DxDistribution = Float64Array

export type DxDistributionProvider = (
  input: DxDistributionInput,
  options?: DxDistributionOptions,
) => DxDistribution
