import type { BacktrackParams } from '../domain/BacktrackRules'

export interface BacktrackDistributionGenerationRequest {
  readonly diceCounts: readonly number[]
  readonly size: number
  readonly livingdead: boolean
  readonly signal?: AbortSignal | null
}

export interface BacktrackDistributionGenerationResult {
  readonly distributions: ReadonlyMap<number, Float64Array>
  readonly maxDice: number
  readonly supportMax: number
}

export interface ValidatedBacktrackExecutionPlan {
  readonly normalizedParams: BacktrackParams
  readonly diceCounts: readonly number[]
}
