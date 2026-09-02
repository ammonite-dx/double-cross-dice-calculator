export interface DxDistributionInput {
  readonly shihai: number
  readonly dice: number
  readonly critical: number
  readonly yousei?: number
}

export interface DxDistributionOptions {
  readonly workingLength?: number
  readonly size?: number
  readonly rounding?: 'legacy' | 'unrounded'
  readonly fftLength?: number
}

export interface SparseDxDistribution {
  readonly offset: number
  readonly values: ArrayLike<number>
}

export type DxDistribution = Float64Array | SparseDxDistribution

/**
 * Object-shaped contract for new callers. The current positional provider is
 * retained for compatibility and can be adapted at this boundary in a later
 * phase without changing cache identity or calculation semantics.
 */
export type DxDistributionProvider = (
  input: DxDistributionInput,
  options?: DxDistributionOptions,
) => DxDistribution
