import { transform } from './fft.js'

const FFT_SIZE = 4096
const DISTRIBUTION_SIZE = 2048
const MAX_DAMAGE_DICE = 202
const MAX_KAZANARI = 9
const NUMERICAL_EPSILON = 1e-12

function complex(real = 0, imaginary = 0) {
  return { real, imaginary }
}

function add(left, right) {
  return complex(
    left.real + right.real,
    left.imaginary + right.imaginary
  )
}

function subtract(left, right) {
  return complex(
    left.real - right.real,
    left.imaginary - right.imaginary
  )
}

function multiply(left, right) {
  return complex(
    left.real * right.real - left.imaginary * right.imaginary,
    left.real * right.imaginary + left.imaginary * right.real
  )
}

function scale(value, factor) {
  return complex(value.real * factor, value.imaginary * factor)
}

function integerPower(value, exponent) {
  let result = complex(1, 0)
  let factor = value
  let remaining = exponent

  while (remaining > 0) {
    if (remaining % 2 === 1) {
      result = multiply(result, factor)
    }
    factor = multiply(factor, factor)
    remaining = Math.floor(remaining / 2)
  }

  return result
}

function binomial(n, k) {
  if (k < 0 || k > n) {
    return 0
  }

  let result = 1
  const count = Math.min(k, n - k)
  for (let index = 1; index <= count; index += 1) {
    result *= (n - count + index) / index
  }
  return result
}

function evaluateNormalizedDerivatives(weights, value, maxOrder) {
  const derivatives = Array.from(
    { length: maxOrder + 1 },
    () => complex()
  )

  for (let degree = weights.length - 1; degree >= 0; degree -= 1) {
    for (let order = maxOrder; order >= 1; order -= 1) {
      derivatives[order] = add(
        multiply(derivatives[order], value),
        derivatives[order - 1]
      )
    }
    derivatives[0] = add(
      multiply(derivatives[0], value),
      complex(weights[degree], 0)
    )
  }

  return derivatives
}

function validateInputs(weights, kazanari) {
  if (
    !Array.isArray(weights) &&
    !(weights instanceof Float64Array)
  ) {
    throw new TypeError('weights must be an Array or Float64Array')
  }
  if (weights.length === 0 || weights.length > MAX_DAMAGE_DICE + 1) {
    throw new RangeError(
      `weights must contain 1 to ${MAX_DAMAGE_DICE + 1} entries`
    )
  }
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('weights must contain finite non-negative values')
    }
  }
  if (
    !Number.isInteger(kazanari) ||
    kazanari < 0 ||
    kazanari > MAX_KAZANARI
  ) {
    throw new RangeError(
      `kazanari must be an integer between 0 and ${MAX_KAZANARI}`
    )
  }
}

function evaluateDiePolynomials(root) {
  const powers = Array(11)
  powers[0] = complex(1, 0)
  for (let face = 1; face <= 10; face += 1) {
    powers[face] = multiply(powers[face - 1], root)
  }

  const suffixes = Array(12)
  suffixes[11] = complex()
  for (let face = 10; face >= 1; face -= 1) {
    suffixes[face] = add(scale(powers[face], 0.1), suffixes[face + 1])
  }

  return { powers, suffixes }
}

function evaluateSpectrumAt(weights, kazanari, frequency) {
  const angle = -2 * Math.PI * frequency / FFT_SIZE
  const root = complex(Math.cos(angle), Math.sin(angle))
  const { powers, suffixes } = evaluateDiePolynomials(root)
  const d10 = suffixes[1]

  if (kazanari === 0) {
    return evaluateNormalizedDerivatives(weights, d10, 0)[0]
  }

  const maxOrder = kazanari - 1
  const high = suffixes[6]
  const rerolledLow = scale(d10, 0.5)
  const highDerivatives = evaluateNormalizedDerivatives(
    weights,
    high,
    maxOrder
  )
  let result = complex()

  for (let lowCount = 0; lowCount < kazanari; lowCount += 1) {
    result = add(
      result,
      multiply(
        integerPower(rerolledLow, lowCount),
        highDerivatives[lowCount]
      )
    )
  }

  let thresholdCases = complex()
  for (let threshold = 1; threshold <= 5; threshold += 1) {
    const equal = scale(powers[threshold], 0.1)
    const atLeastThreshold = suffixes[threshold]
    const aboveThreshold = suffixes[threshold + 1]
    const atLeastDerivatives = evaluateNormalizedDerivatives(
      weights,
      atLeastThreshold,
      maxOrder
    )
    const aboveDerivatives = evaluateNormalizedDerivatives(
      weights,
      aboveThreshold,
      maxOrder
    )
    const belowProbability = (threshold - 1) / 10

    for (let belowCount = 0; belowCount < kazanari; belowCount += 1) {
      if (belowProbability === 0 && belowCount > 0) {
        continue
      }

      const removedAtThreshold = kazanari - belowCount
      let eligible = atLeastDerivatives[belowCount]

      for (
        let equalCount = 0;
        equalCount < removedAtThreshold;
        equalCount += 1
      ) {
        const excluded = multiply(
          integerPower(equal, equalCount),
          aboveDerivatives[belowCount + equalCount]
        )
        eligible = subtract(
          eligible,
          scale(excluded, binomial(belowCount + equalCount, belowCount))
        )
      }

      const removedValue = threshold * removedAtThreshold
      const shiftAngle = -angle * removedValue
      const shifted = multiply(
        eligible,
        complex(Math.cos(shiftAngle), Math.sin(shiftAngle))
      )
      thresholdCases = add(
        thresholdCases,
        scale(shifted, belowProbability**belowCount)
      )
    }
  }

  return add(
    result,
    multiply(integerPower(d10, kazanari), thresholdCases)
  )
}

function spectrumToDistribution(real, imaginary) {
  transform(real, imaginary, true)
  const distribution = new Float64Array(DISTRIBUTION_SIZE)

  for (let value = 0; value < DISTRIBUTION_SIZE - 1; value += 1) {
    const probability = real[value]
    distribution[value] =
      Math.abs(probability) < NUMERICAL_EPSILON ? 0 : probability
  }
  for (let value = DISTRIBUTION_SIZE - 1; value < FFT_SIZE; value += 1) {
    const probability = real[value]
    distribution[DISTRIBUTION_SIZE - 1] +=
      Math.abs(probability) < NUMERICAL_EPSILON ? 0 : probability
  }

  return distribution
}

export function generateMixedDamageDistributionReference(
  weights,
  kazanari
) {
  validateInputs(weights, kazanari)

  const real = new Float64Array(FFT_SIZE)
  const imaginary = new Float64Array(FFT_SIZE)
  const halfSize = FFT_SIZE / 2

  for (let frequency = 0; frequency <= halfSize; frequency += 1) {
    const value = evaluateSpectrumAt(weights, kazanari, frequency)
    real[frequency] = value.real
    imaginary[frequency] = value.imaginary

    if (frequency > 0 && frequency < halfSize) {
      real[FFT_SIZE - frequency] = value.real
      imaginary[FFT_SIZE - frequency] = -value.imaginary
    }
  }

  return spectrumToDistribution(real, imaginary)
}

export const runtimeDamageRollReferenceConstants = {
  distributionSize: DISTRIBUTION_SIZE,
  fftSize: FFT_SIZE,
  maxDamageDice: MAX_DAMAGE_DICE,
  maxKazanari: MAX_KAZANARI,
}
