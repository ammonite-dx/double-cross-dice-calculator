import { transform } from './RuntimeDamageRollFFT'
import {
  MAX_KAZANARI,
  normalizeRuntimeDamageRollOptions,
  validateRuntimeDamageRollInputs,
} from './RuntimeDamageRollLimits'

export {
  MAX_DAMAGE_DICE,
  MAX_KAZANARI,
  getRuntimeDamageRollRawSupportMax,
  normalizeRuntimeDamageRollOptions,
  RUNTIME_DAMAGE_MAX_FFT_SIZE,
  RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE,
  RUNTIME_DAMAGE_MIN_FFT_SIZE,
  RUNTIME_DAMAGE_DISTRIBUTION_SIZE,
  RUNTIME_DAMAGE_FFT_SIZE,
  RUNTIME_DAMAGE_MAX_DAMAGE_DICE,
  RUNTIME_DAMAGE_MAX_KAZANARI,
  validateRuntimeDamageRollInputs,
} from './RuntimeDamageRollLimits'

// The inverse FFT leaves round-off noise around 1e-15 in the current full
// enumeration/reference cases. Keep the existing 1e-12 cleanup threshold:
// it removes that noise while remaining far below any material probability.
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

function evaluateSpectrumAt(
  weights,
  kazanari,
  frequency,
  fftLength,
  scratch
) {
  const angle = -2 * Math.PI * frequency / fftLength
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
      thresholdCasesReal +=
        belowWeight * (
          eligibleReal * shiftReal - eligibleImaginary * shiftImaginary
        )
      thresholdCasesImaginary +=
        belowWeight * (
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

function normalizeInverseProbability(probability) {
  if (!Number.isFinite(probability)) {
    throw new RangeError('inverse FFT produced a non-finite probability')
  }
  if (Math.abs(probability) <= NUMERICAL_EPSILON) {
    return 0
  }
  if (probability < 0) {
    throw new RangeError(
      'inverse FFT produced a materially negative probability'
    )
  }
  return probability
}

function spectrumToDistribution(
  real,
  imaginary,
  distributionLength,
  actualSupportMax,
  expectedTotal
) {
  transform(real, imaginary, true)
  const distribution = new Float64Array(distributionLength)

  for (let value = 0; value < real.length; value += 1) {
    if (!Number.isFinite(imaginary[value])) {
      throw new RangeError('inverse FFT produced a non-finite value')
    }
    if (value > actualSupportMax) {
      if (!Number.isFinite(real[value])) {
        throw new RangeError('inverse FFT produced a non-finite probability')
      }
      if (Math.abs(real[value]) > NUMERICAL_EPSILON) {
        throw new RangeError(
          'inverse FFT produced material probability outside finite support'
        )
      }
      continue
    }
    const probability = normalizeInverseProbability(real[value])
    const outputValue = Math.min(value, distributionLength - 1)
    distribution[outputValue] += probability
  }

  let total = 0
  let correctionIndex = 0
  for (let value = 0; value < distribution.length; value += 1) {
    const probability = distribution[value]
    if (!Number.isFinite(probability)) {
      throw new RangeError('distribution contains a non-finite probability')
    }
    if (probability < -NUMERICAL_EPSILON) {
      throw new RangeError('distribution contains a materially negative probability')
    }
    if (probability < 0) {
      distribution[value] = 0
    }
    total += distribution[value]
    if (distribution[value] > distribution[correctionIndex]) {
      correctionIndex = value
    }
  }

  if (!Number.isFinite(total)) {
    throw new RangeError('distribution total must be finite')
  }
  const totalDifference = expectedTotal - total
  const totalTolerance = 1e-8 * Math.max(1, expectedTotal)
  if (Math.abs(totalDifference) > totalTolerance) {
    throw new RangeError('distribution total does not match weight total')
  }
  if (totalDifference !== 0) {
    const corrected = distribution[correctionIndex] + totalDifference
    if (corrected < -NUMERICAL_EPSILON || !Number.isFinite(corrected)) {
      throw new RangeError('distribution total correction produced an invalid probability')
    }
    distribution[correctionIndex] = corrected < 0 ? 0 : corrected
  }

  let correctedTotal = 0
  for (const probability of distribution) {
    if (!Number.isFinite(probability) || probability < -NUMERICAL_EPSILON) {
      throw new RangeError('distribution failed numerical validation')
    }
    correctedTotal += probability
  }
  if (
    !Number.isFinite(correctedTotal) ||
    Math.abs(correctedTotal - expectedTotal) > totalTolerance
  ) {
    throw new RangeError('distribution total failed numerical validation')
  }

  return distribution
}

export function generateMixedDamageDistribution(
  weights,
  kazanari,
  options
) {
  const {
    rawSupportMax: actualSupportMax,
    total,
  } = validateRuntimeDamageRollInputs(weights, kazanari)
  const normalizedOptions = normalizeRuntimeDamageRollOptions(
    options,
    actualSupportMax
  )
  const { fftLength, distributionLength } = normalizedOptions

  const real = new Float64Array(fftLength)
  const imaginary = new Float64Array(fftLength)
  const scratch = createScratch()
  const halfSize = fftLength / 2

  for (let frequency = 0; frequency <= halfSize; frequency += 1) {
    const [valueReal, valueImaginary] = evaluateSpectrumAt(
      weights,
      kazanari,
      frequency,
      fftLength,
      scratch
    )
    real[frequency] = valueReal
    imaginary[frequency] = valueImaginary

    if (frequency > 0 && frequency < halfSize) {
      real[fftLength - frequency] = valueReal
      imaginary[fftLength - frequency] = -valueImaginary
    }
  }

  return spectrumToDistribution(
    real,
    imaginary,
    distributionLength,
    actualSupportMax,
    total
  )
}
