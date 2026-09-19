import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
} from '../domain/InputDomain'
import { getConvolutionFftLength } from '../core/probability/FFT'

export const DX_MIN_DISTRIBUTION_SIZE = 2
export const DX_CRITICAL_MAX = 11

/**
 * Return the number of critical blocks that can contribute to explicit score
 * buckets for the requested working array.
 */
export function getDxYouseiBlockLength(workingLength, yousei) {
  if (
    !Number.isSafeInteger(workingLength)
    || workingLength < DX_MIN_DISTRIBUTION_SIZE
  ) {
    throw new RangeError('workingLength must be at least 2')
  }
  assertNonNegativeSafeInteger(yousei, 'yousei')
  const available = workingLength - 3
  const minimumBlocks = Math.floor(available / 10)
  if (yousei > minimumBlocks) {
    return 0
  }
  return Math.floor((available - 10 * yousei) / 10) + 1
}

export function getDxYouseiFftLength(workingLength, critical, yousei) {
  const blockLength = getDxYouseiBlockLength(workingLength, yousei)
  assertCriticalValue(critical)
  assertNonNegativeSafeInteger(yousei, 'yousei')
  if (yousei === 0 || critical === DX_CRITICAL_MAX) {
    return 0
  }
  return blockLength === 0
    ? 0
    : getConvolutionFftLength(blockLength, blockLength)
}
