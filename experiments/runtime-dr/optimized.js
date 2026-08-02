import { transform } from './fft.js'

const FFT_SIZE = 4096
const DISTRIBUTION_SIZE = 2048
const MAX_DAMAGE_DICE = 202
const MAX_KAZANARI = 9
const NUMERICAL_EPSILON = 1e-12

const binomialTable = (() => {
  const table = []
  for (let n = 0; n <= MAX_KAZANARI; n += 1) {
    const row = new Float64Array(MAX_KAZANARI + 1)
    row[0] = 1
    row[n] = 1
    for (let k = 1; k < n; k += 1) {
      row[k] = table[n - 1][k - 1] + table[n - 1][k]
    }
    table.push(row)
  }
  return table
})()

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

function evaluatePolynomial(weights, valueReal, valueImaginary) {
  let resultReal = 0
  let resultImaginary = 0

  for (let degree = weights.length - 1; degree >= 0; degree -= 1) {
    const nextReal =
      resultReal * valueReal - resultImaginary * valueImaginary +
      weights[degree]
    resultImaginary =
      resultReal * valueImaginary + resultImaginary * valueReal
    resultReal = nextReal
  }

  return [resultReal, resultImaginary]
}

function evaluateNormalizedDerivatives(
  weights,
  valueReal,
  valueImaginary,
  maxOrder,
  resultReal,
  resultImaginary
) {
  resultReal.fill(0)
  resultImaginary.fill(0)

  for (let degree = weights.length - 1; degree >= 0; degree -= 1) {
    for (let order = maxOrder; order >= 1; order -= 1) {
      const currentReal = resultReal[order]
      const currentImaginary = resultImaginary[order]
      resultReal[order] =
        currentReal * valueReal - currentImaginary * valueImaginary +
        resultReal[order - 1]
      resultImaginary[order] =
        currentReal * valueImaginary + currentImaginary * valueReal +
        resultImaginary[order - 1]
    }

    const currentReal = resultReal[0]
    const currentImaginary = resultImaginary[0]
    resultReal[0] =
      currentReal * valueReal - currentImaginary * valueImaginary +
      weights[degree]
    resultImaginary[0] =
      currentReal * valueImaginary + currentImaginary * valueReal
  }
}

function integerPower(valueReal, valueImaginary, exponent) {
  let resultReal = 1
  let resultImaginary = 0
  let factorReal = valueReal
  let factorImaginary = valueImaginary
  let remaining = exponent

  while (remaining > 0) {
    if (remaining % 2 === 1) {
      const nextReal =
        resultReal * factorReal - resultImaginary * factorImaginary
      resultImaginary =
        resultReal * factorImaginary + resultImaginary * factorReal
      resultReal = nextReal
    }

    const nextFactorReal =
      factorReal * factorReal - factorImaginary * factorImaginary
    factorImaginary = 2 * factorReal * factorImaginary
    factorReal = nextFactorReal
    remaining = Math.floor(remaining / 2)
  }

  return [resultReal, resultImaginary]
}

function createScratch() {
  return {
    powerReal: new Float64Array(11),
    powerImaginary: new Float64Array(11),
    suffixReal: new Float64Array(12),
    suffixImaginary: new Float64Array(12),
    highDerivativeReal: new Float64Array(MAX_KAZANARI),
    highDerivativeImaginary: new Float64Array(MAX_KAZANARI),
    atLeastDerivativeReal: new Float64Array(MAX_KAZANARI),
    atLeastDerivativeImaginary: new Float64Array(MAX_KAZANARI),
    aboveDerivativeReal: new Float64Array(MAX_KAZANARI),
    aboveDerivativeImaginary: new Float64Array(MAX_KAZANARI),
  }
}

function evaluateSpectrumAt(weights, kazanari, frequency, scratch) {
  const angle = -2 * Math.PI * frequency / FFT_SIZE
  const rootReal = Math.cos(angle)
  const rootImaginary = Math.sin(angle)
  const {
    powerReal,
    powerImaginary,
    suffixReal,
    suffixImaginary,
    highDerivativeReal,
    highDerivativeImaginary,
    atLeastDerivativeReal,
    atLeastDerivativeImaginary,
    aboveDerivativeReal,
    aboveDerivativeImaginary,
  } = scratch

  powerReal[0] = 1
  powerImaginary[0] = 0
  for (let face = 1; face <= 10; face += 1) {
    powerReal[face] =
      powerReal[face - 1] * rootReal -
      powerImaginary[face - 1] * rootImaginary
    powerImaginary[face] =
      powerReal[face - 1] * rootImaginary +
      powerImaginary[face - 1] * rootReal
  }

  suffixReal[11] = 0
  suffixImaginary[11] = 0
  for (let face = 10; face >= 1; face -= 1) {
    suffixReal[face] = 0.1 * powerReal[face] + suffixReal[face + 1]
    suffixImaginary[face] =
      0.1 * powerImaginary[face] + suffixImaginary[face + 1]
  }

  const d10Real = suffixReal[1]
  const d10Imaginary = suffixImaginary[1]
  if (kazanari === 0) {
    return evaluatePolynomial(weights, d10Real, d10Imaginary)
  }

  const maxOrder = kazanari - 1
  evaluateNormalizedDerivatives(
    weights,
    suffixReal[6],
    suffixImaginary[6],
    maxOrder,
    highDerivativeReal,
    highDerivativeImaginary
  )

  let resultReal = 0
  let resultImaginary = 0
  let rerolledLowPowerReal = 1
  let rerolledLowPowerImaginary = 0
  const rerolledLowReal = 0.5 * d10Real
  const rerolledLowImaginary = 0.5 * d10Imaginary

  for (let lowCount = 0; lowCount < kazanari; lowCount += 1) {
    resultReal +=
      rerolledLowPowerReal * highDerivativeReal[lowCount] -
      rerolledLowPowerImaginary * highDerivativeImaginary[lowCount]
    resultImaginary +=
      rerolledLowPowerReal * highDerivativeImaginary[lowCount] +
      rerolledLowPowerImaginary * highDerivativeReal[lowCount]

    const nextPowerReal =
      rerolledLowPowerReal * rerolledLowReal -
      rerolledLowPowerImaginary * rerolledLowImaginary
    rerolledLowPowerImaginary =
      rerolledLowPowerReal * rerolledLowImaginary +
      rerolledLowPowerImaginary * rerolledLowReal
    rerolledLowPowerReal = nextPowerReal
  }

  let thresholdCasesReal = 0
  let thresholdCasesImaginary = 0
  for (let threshold = 1; threshold <= 5; threshold += 1) {
    evaluateNormalizedDerivatives(
      weights,
      suffixReal[threshold],
      suffixImaginary[threshold],
      maxOrder,
      atLeastDerivativeReal,
      atLeastDerivativeImaginary
    )
    evaluateNormalizedDerivatives(
      weights,
      suffixReal[threshold + 1],
      suffixImaginary[threshold + 1],
      maxOrder,
      aboveDerivativeReal,
      aboveDerivativeImaginary
    )

    const equalReal = 0.1 * powerReal[threshold]
    const equalImaginary = 0.1 * powerImaginary[threshold]
    const belowProbability = (threshold - 1) / 10
    let belowWeight = 1

    for (let belowCount = 0; belowCount < kazanari; belowCount += 1) {
      if (belowWeight === 0) {
        break
      }

      const removedAtThreshold = kazanari - belowCount
      let eligibleReal = atLeastDerivativeReal[belowCount]
      let eligibleImaginary = atLeastDerivativeImaginary[belowCount]
      let equalPowerReal = 1
      let equalPowerImaginary = 0

      for (
        let equalCount = 0;
        equalCount < removedAtThreshold;
        equalCount += 1
      ) {
        const derivativeOrder = belowCount + equalCount
        const excludedReal =
          equalPowerReal * aboveDerivativeReal[derivativeOrder] -
          equalPowerImaginary * aboveDerivativeImaginary[derivativeOrder]
        const excludedImaginary =
          equalPowerReal * aboveDerivativeImaginary[derivativeOrder] +
          equalPowerImaginary * aboveDerivativeReal[derivativeOrder]
        const coefficient = binomialTable[derivativeOrder][belowCount]
        eligibleReal -= coefficient * excludedReal
        eligibleImaginary -= coefficient * excludedImaginary

        const nextEqualPowerReal =
          equalPowerReal * equalReal -
          equalPowerImaginary * equalImaginary
        equalPowerImaginary =
          equalPowerReal * equalImaginary +
          equalPowerImaginary * equalReal
        equalPowerReal = nextEqualPowerReal
      }

      const removedValue = threshold * removedAtThreshold
      const shiftReal = Math.cos(-angle * removedValue)
      const shiftImaginary = Math.sin(-angle * removedValue)
      thresholdCasesReal += belowWeight * (
        eligibleReal * shiftReal - eligibleImaginary * shiftImaginary
      )
      thresholdCasesImaginary += belowWeight * (
        eligibleReal * shiftImaginary + eligibleImaginary * shiftReal
      )
      belowWeight *= belowProbability
    }
  }

  const [rerollsReal, rerollsImaginary] = integerPower(
    d10Real,
    d10Imaginary,
    kazanari
  )
  resultReal +=
    rerollsReal * thresholdCasesReal -
    rerollsImaginary * thresholdCasesImaginary
  resultImaginary +=
    rerollsReal * thresholdCasesImaginary +
    rerollsImaginary * thresholdCasesReal

  return [resultReal, resultImaginary]
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

export function generateMixedDamageDistributionOptimized(
  weights,
  kazanari
) {
  validateInputs(weights, kazanari)

  const real = new Float64Array(FFT_SIZE)
  const imaginary = new Float64Array(FFT_SIZE)
  const scratch = createScratch()
  const halfSize = FFT_SIZE / 2

  for (let frequency = 0; frequency <= halfSize; frequency += 1) {
    const [valueReal, valueImaginary] = evaluateSpectrumAt(
      weights,
      kazanari,
      frequency,
      scratch
    )
    real[frequency] = valueReal
    imaginary[frequency] = valueImaginary

    if (frequency > 0 && frequency < halfSize) {
      real[FFT_SIZE - frequency] = valueReal
      imaginary[FFT_SIZE - frequency] = -valueImaginary
    }
  }

  return spectrumToDistribution(real, imaginary)
}
