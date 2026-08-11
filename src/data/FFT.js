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

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('The FFT convolution was aborted')
    error.name = 'AbortError'
    throw error
  }
}

function transform(real, imaginary, inverse = false, signal) {
  const size = real.length
  throwIfAborted(signal)

  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1
    while (reversed & bit) {
      reversed ^= bit
      bit >>= 1
    }
    reversed ^= bit

    if (index < reversed) {
      const currentReal = real[index]
      const currentImaginary = imaginary[index]
      real[index] = real[reversed]
      imaginary[index] = imaginary[reversed]
      real[reversed] = currentReal
      imaginary[reversed] = currentImaginary
    }
  }
  throwIfAborted(signal)

  for (let width = 2; width <= size; width *= 2) {
    throwIfAborted(signal)
    const angle = (inverse ? 2 : -2) * Math.PI / width
    const baseReal = Math.cos(angle)
    const baseImaginary = Math.sin(angle)

    for (let offset = 0; offset < size; offset += width) {
      let factorReal = 1
      let factorImaginary = 0
      const halfWidth = width / 2

      for (let index = 0; index < halfWidth; index += 1) {
        const even = offset + index
        const odd = even + halfWidth
        const oddReal =
          real[odd] * factorReal - imaginary[odd] * factorImaginary
        const oddImaginary =
          real[odd] * factorImaginary + imaginary[odd] * factorReal
        const evenReal = real[even]
        const evenImaginary = imaginary[even]

        real[even] = evenReal + oddReal
        imaginary[even] = evenImaginary + oddImaginary
        real[odd] = evenReal - oddReal
        imaginary[odd] = evenImaginary - oddImaginary

        const nextFactorReal =
          factorReal * baseReal - factorImaginary * baseImaginary
        factorImaginary =
          factorReal * baseImaginary + factorImaginary * baseReal
        factorReal = nextFactorReal
      }
    }
    throwIfAborted(signal)
  }

  if (inverse) {
    for (let index = 0; index < size; index += 1) {
      real[index] /= size
      imaginary[index] /= size
    }
  }
  throwIfAborted(signal)
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
  throwIfAborted(normalizedOptions.signal)

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
  throwIfAborted(normalizedOptions.signal)
  const firstReal = new Float64Array(transformSize)
  const firstImaginary = new Float64Array(transformSize)
  const secondReal = new Float64Array(transformSize)
  const secondImaginary = new Float64Array(transformSize)

  firstReal.set(distribution1)
  secondReal.set(distribution2)
  transform(firstReal, firstImaginary, false, normalizedOptions.signal)
  transform(secondReal, secondImaginary, false, normalizedOptions.signal)

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
  throwIfAborted(normalizedOptions.signal)

  transform(firstReal, firstImaginary, true, normalizedOptions.signal)
  throwIfAborted(normalizedOptions.signal)
  return firstReal.slice(0, resultLength)
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
    result[value] = Math.max(0, convolved[value])
  }
  for (let value = size - 1; value < convolved.length; value += 1) {
    result[size - 1] += Math.max(0, convolved[value])
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
    result[0] += Math.max(0, convolved[index])
  }
  for (let value = 1; value < size; value += 1) {
    result[value] = Math.max(
      0,
      convolved[distribution2.length - 1 + value],
    )
  }

  return result
}
