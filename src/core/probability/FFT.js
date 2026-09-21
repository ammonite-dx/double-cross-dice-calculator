import { transformRadix2FftInPlace } from './Radix2FFT'

function assertCompatibleDistributions(distribution1, distribution2) {
  if (
    distribution1.length === 0 ||
    distribution1.length !== distribution2.length
  ) {
    throw new Error('Distributions must have the same non-zero length')
  }
}

function assertNonEmptyDistributions(distribution1, distribution2) {
  if (distribution1.length === 0 || distribution2.length === 0) {
    throw new Error('Distributions must have non-zero length')
  }
}

export function getConvolutionFftLength(length, otherLength = length) {
  if (!Number.isSafeInteger(length) || length <= 0 ||
      !Number.isSafeInteger(otherLength) || otherLength <= 0) {
    throw new RangeError(
      'distribution lengths must be positive safe integers'
    )
  }
  const requiredLength = length + otherLength - 1
  if (!Number.isSafeInteger(requiredLength)) {
    throw new RangeError('distribution length is too large for an FFT')
  }
  let result = 1
  while (result < requiredLength) {
    if (result > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError('distribution length is too large for an FFT')
    }
    result *= 2
  }
  return result
}

// FFT round-off can leave a tiny negative coefficient even when both input
// distributions are non-negative.  Treat only that bounded numerical noise
// as cleanup; a larger negative is a failed calculation and must not be
// silently converted into probability mass.
export const FFT_COEFFICIENT_CLEANUP_TOLERANCE = 1e-12

export function sanitizeFftCoefficients(values) {
  for (let index = 0; index < values.length; index += 1) {
    const coefficient = values[index]
    if (!Number.isFinite(coefficient)) {
      throw new RangeError(
        `FFT convolution produced a non-finite coefficient at index ${index}`
      )
    }
    if (coefficient < -FFT_COEFFICIENT_CLEANUP_TOLERANCE) {
      throw new RangeError(
        `FFT convolution produced a materially negative coefficient at index ${index}`
      )
    }
    if (coefficient < 0) {
      values[index] = 0
    }
  }
  return values
}

/**
 * Compute the complete linear convolution of two non-empty distributions.
 * Unlike sumDistribution, this helper keeps every coefficient and accepts
 * different input lengths.
 */
export function convolveDistributions(distribution1, distribution2, options = {}) {
  const normalizedOptions = typeof options === 'number'
    ? { fftLength: options }
    : options ?? {}
  assertNonEmptyDistributions(distribution1, distribution2)

  const resultLength = distribution1.length + distribution2.length - 1
  const requiredFftLength = getConvolutionFftLength(
    distribution1.length,
    distribution2.length,
  )
  const transformSize = normalizedOptions.fftLength ?? requiredFftLength
  if (transformSize !== requiredFftLength) {
    throw new RangeError(
      `fftLength must equal ${requiredFftLength} for distributions of lengths ${distribution1.length} and ${distribution2.length}`
    )
  }
  if (typeof normalizedOptions.onFftLength === 'function') {
    normalizedOptions.onFftLength(transformSize)
  }
  const firstReal = new Float64Array(transformSize)
  const firstImaginary = new Float64Array(transformSize)
  const secondReal = new Float64Array(transformSize)
  const secondImaginary = new Float64Array(transformSize)

  firstReal.set(distribution1)
  secondReal.set(distribution2)
  transformRadix2FftInPlace(
    firstReal,
    firstImaginary,
    false,
    normalizedOptions.signal,
  )
  transformRadix2FftInPlace(
    secondReal,
    secondImaginary,
    false,
    normalizedOptions.signal,
  )

  for (let index = 0; index < transformSize; index += 1) {
    const real =
      firstReal[index] * secondReal[index] -
      firstImaginary[index] * secondImaginary[index]
    const imaginary =
      firstReal[index] * secondImaginary[index] +
      firstImaginary[index] * secondReal[index]
    firstReal[index] = real
    firstImaginary[index] = imaginary
  }

  transformRadix2FftInPlace(
    firstReal,
    firstImaginary,
    true,
    normalizedOptions.signal,
  )
  return sanitizeFftCoefficients(firstReal.slice(0, resultLength))
}

export function sumDistribution(distribution1, distribution2, options = {}) {
  const normalizedOptions = typeof options === 'number'
    ? { fftLength: options }
    : options ?? {}
  assertCompatibleDistributions(distribution1, distribution2)
  const size = distribution1.length
  const convolved = convolveDistributions(
    distribution1,
    distribution2,
    normalizedOptions
  )
  const result = Array(size).fill(0)

  for (let value = 0; value < size - 1; value += 1) {
    result[value] = convolved[value]
  }
  for (let value = size - 1; value < convolved.length; value += 1) {
    result[size - 1] += convolved[value]
  }

  return result
}

export function subDistribution(distribution1, distribution2, options = {}) {
  assertNonEmptyDistributions(distribution1, distribution2)

  const normalizedOptions = typeof options === 'number'
    ? { fftLength: options }
    : options ?? {}

  const size = distribution1.length
  const convolved = convolveDistributions(
    distribution1,
    distribution2.slice().reverse(),
    normalizedOptions,
  )
  const result = Array(size).fill(0)

  for (let index = 0; index < distribution2.length; index += 1) {
    result[0] += convolved[index]
  }
  for (let value = 1; value < size; value += 1) {
    result[value] = convolved[distribution2.length - 1 + value]
  }

  return result
}
