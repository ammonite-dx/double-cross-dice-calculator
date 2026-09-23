/**
 * The planner's default limits are deliberately smaller than these direct
 * core limits. The support-length ceiling matches the direct DX API scale,
 * while the operation ceiling prevents the O(n²) backtrack DP from turning a
 * large future input into an accidental long-running or memory-heavy call.
 */
export const BACKTRACK_MAX_GENERATED_DICE = 1 << 12
export const BACKTRACK_MAX_GENERATION_LENGTH = 1 << 16
export const BACKTRACK_MAX_GENERATION_OPERATIONS = 100_000_000
export const BACKTRACK_ABORT_CHECK_INTERVAL = 4_096

export const BACKTRACK_D10_GENERATION_FACTOR = 10
// CPU-work calibration for the bounded-sum kernel, not a literal loop count.
export const BACKTRACK_LIVINGDEAD_GENERATION_FACTOR = 14

export interface BacktrackFloat64MemoryEstimate {
  readonly baseFloat64Bytes: number
  readonly resultFloat64Bytes: number
  readonly float64Bytes: number
}

function multiplySafe(left: number, right: number, label: string): number {
  const result = left * right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must be a safe integer`)
  }
  return result
}

/**
 * Estimate Backtrack Float64 storage, including simultaneously-live
 * generation outputs and projection/normalization scratch arrays.
 */
export function getBacktrackFloat64MemoryEstimate(
  maxDice: number,
  workingLength: number,
  livingdead: boolean,
): BacktrackFloat64MemoryEstimate {
  if (!Number.isSafeInteger(maxDice) || maxDice < 0) {
    throw new RangeError('maxDice must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(workingLength) || workingLength <= 0) {
    throw new RangeError('workingLength must be a positive safe integer')
  }

  const bytesPerElement = Float64Array.BYTES_PER_ELEMENT
  const generatedAndTemporaryElements = multiplySafe(
    5,
    workingLength,
    'backtrack generation memory estimate',
  )
  const generationWorkspaceBytes = multiplySafe(
    generatedAndTemporaryElements,
    bytesPerElement,
    'backtrack generation memory estimate',
  )
  let boundedSumStateBytes = 0
  if (livingdead && maxDice > 0) {
    const rawSumLength = multiplySafe(
      10,
      maxDice,
      'livingdead raw sum length',
    ) + 1
    if (!Number.isSafeInteger(rawSumLength)) {
      throw new RangeError('livingdead raw sum length must be a safe integer')
    }
    const stateElements = multiplySafe(
      10,
      rawSumLength,
      'livingdead bounded-sum state size',
    )
    boundedSumStateBytes = multiplySafe(
      stateElements,
      bytesPerElement,
      'livingdead bounded-sum memory estimate',
    )
  }

  const resultElements = multiplySafe(
    3,
    workingLength,
    'backtrack result memory estimate',
  )
  const resultFloat64Bytes = multiplySafe(
    resultElements,
    bytesPerElement,
    'backtrack result memory estimate',
  )
  const baseFloat64Bytes = boundedSumStateBytes + generationWorkspaceBytes
  const float64Bytes = baseFloat64Bytes + resultFloat64Bytes
  if (!Number.isSafeInteger(baseFloat64Bytes) || !Number.isSafeInteger(float64Bytes)) {
    throw new RangeError('backtrack memory estimate must be a safe integer')
  }

  return { baseFloat64Bytes, resultFloat64Bytes, float64Bytes }
}

export function getBacktrackGenerationOperationEstimate(
  maxDice: number,
  size: number,
  livingdead: boolean,
): number {
  const factor = livingdead
    ? BACKTRACK_LIVINGDEAD_GENERATION_FACTOR
    : BACKTRACK_D10_GENERATION_FACTOR
  return maxDice * size * factor
}
