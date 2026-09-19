import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertSupportedScoreFeatures,
} from '../domain/InputDomain'
import {
  convolveDistributions,
  getConvolutionFftLength,
} from '../core/probability/FFT'
import {
  calculateYouseiTailProbability,
  maxGeometricTail,
  negativeBinomialPmf,
  oneDieTail,
} from './DxTailModel'
import {
  calculateDxOrderStatisticTail,
  getDxOrderStatisticOperationEstimate,
} from './DxOrderStatistic'
import {
  DX_CRITICAL_MAX,
  DX_MIN_DISTRIBUTION_SIZE,
  getDxOperationEstimate,
  getDxYouseiBlockLength,
  getDxYouseiFftLength,
} from './DxWorkingShape'

export {
  DX_CRITICAL_MAX,
  DX_MIN_DISTRIBUTION_SIZE,
  getDxOperationEstimate,
  getDxYouseiBlockLength,
  getDxYouseiFftLength,
} from './DxWorkingShape'

// The planner's default hard policy is deliberately lower than this direct
// API safety ceiling. Keep the ceiling explicit so a future planner policy
// can be changed without making an arbitrary array allocation safe by
// accident.
export const DX_MAX_DISTRIBUTION_SIZE = 1 << 16
export const DX_CRITICAL_MIN = 2
export const DX_SHIHAI_MIN = 0
// These are absolute implementation-safety limits, not game input limits.
// The planner normally rejects much smaller requests based on the shared
// CPU-work and memory policy, while direct callers still need a finite guard
// before an oversized typed-array allocation is attempted.
export const DX_MAX_CALCULATION_OPERATIONS = 2_000_000_000
export const DX_MAX_CALCULATION_BYTES = 512 * 1024 * 1024

const FULL_PRECISION_NEGATIVE_TOLERANCE = 1e-12

function validateInput(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(
      'calculateDxDistribution expects { dice, critical, shihai, yousei }'
    )
  }

  const {
    dice,
    critical,
    shihai = 0,
    yousei = 0,
  } = params
  assertNonNegativeSafeInteger(dice, 'dice')
  assertCriticalValue(critical)
  assertNonNegativeSafeInteger(shihai, 'shihai')
  assertNonNegativeSafeInteger(yousei, 'yousei')
  assertSupportedScoreFeatures({ shihai, yousei })
}

function safeProduct(left, right, label) {
  const product = left * right
  if (!Number.isSafeInteger(product) || product < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`)
  }
  return product
}

export function normalizeDxOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      'calculateDxDistribution options must be an object with an explicit workingLength'
    )
  }

  const suppliedLength = options.workingLength
  const workingLength = suppliedLength
  if (workingLength === undefined) {
    throw new TypeError(
      'calculateDxDistribution options.workingLength is required'
    )
  }
  if (!Number.isSafeInteger(workingLength)) {
    throw new TypeError('workingLength must be a safe integer')
  }
  if (workingLength < DX_MIN_DISTRIBUTION_SIZE) {
    throw new RangeError(
      `workingLength must be at least ${DX_MIN_DISTRIBUTION_SIZE}`
    )
  }
  if (workingLength > DX_MAX_DISTRIBUTION_SIZE) {
    throw new RangeError(
      `workingLength must not exceed ${DX_MAX_DISTRIBUTION_SIZE}`
    )
  }

  const fftLength = options.fftLength
  if (
    fftLength !== undefined
    && (!Number.isSafeInteger(fftLength) || fftLength < 0)
  ) {
    throw new TypeError('fftLength must be a non-negative safe integer')
  }

  return {
    workingLength,
    ...(fftLength === undefined ? {} : { fftLength }),
  }
}

function calculateShihaiZeroDistribution(
  dice,
  critical,
  workingLength
) {
  const result = new Float64Array(workingLength)
  if (dice === 0) {
    result[0] = 1
    return result
  }

  // For shihai=0, the result is the maximum of dice independent rolls.
  // If F_c(x) is the one-die cumulative distribution, then
  // P(V_{n,c} <= x) = F_c(x)^n.
  let previousTail = 1
  const overflowIndex = workingLength - 1
  for (let value = 0; value < overflowIndex; value += 1) {
    const oneDieTailProbability = oneDieTail(value, critical)
    const tail = oneDieTailProbability === 1
      ? 1
      : -Math.expm1(
          dice * Math.log1p(-oneDieTailProbability)
        )
    result[value] = previousTail - tail
    previousTail = tail
  }
  result[overflowIndex] = previousTail
  return result
}

function calculateShihaiPositiveDistribution(
  dice,
  critical,
  shihai,
  workingLength
) {
  if (dice <= shihai) {
    if (dice > 0 && workingLength < 3) {
      throw new RangeError(
        'workingLength must include explicit raw value 1 and an overflow bucket'
      )
    }
    const result = new Float64Array(workingLength)
    // A positive dice count whose every die is covered by 《支配の領域》
    // becomes a fumble (raw DX value 1), not an automatic failure (raw 0).
    // ScoreCalculator owns the subsequent fumble-to-zero conversion.
    result[dice === 0 ? 0 : 1] = 1
    return result
  }

  const estimatedOperations = getDxOrderStatisticOperationEstimate(
    workingLength,
    dice,
    shihai,
    critical
  )
  const estimatedBytes = safeProduct(
    2,
    safeProduct(
      workingLength,
      Float64Array.BYTES_PER_ELEMENT,
      'DX array size'
    ),
    'DX array size'
  )
  if (estimatedOperations > DX_MAX_CALCULATION_OPERATIONS) {
    throw new RangeError(
      `DX calculation exceeds the absolute safety limit of ${DX_MAX_CALCULATION_OPERATIONS} operations`
    )
  }
  if (estimatedBytes > DX_MAX_CALCULATION_BYTES) {
    throw new RangeError(
      `DX calculation exceeds the absolute safety limit of ${DX_MAX_CALCULATION_BYTES} bytes`
    )
  }

  // A positive shihai result is the (shihai + 1)-th largest complete 1DX
  // result. Build its PMF from adjacent exact tails; no dice-sized state table
  // or critical-count transition recurrence is needed.
  const result = new Float64Array(workingLength)
  const overflowIndex = workingLength - 1
  let previousTail = 1
  for (let value = 0; value < overflowIndex; value += 1) {
    const tail = calculateDxOrderStatisticTail(
      value,
      dice,
      critical,
      shihai
    )
    const mass = previousTail - tail
    if (mass < -FULL_PRECISION_NEGATIVE_TOLERANCE) {
      throw new RangeError('DX order-statistic calculation produced a negative probability')
    }
    result[value] = mass < 0 ? 0 : mass
    previousTail = tail
  }
  result[overflowIndex] = previousTail
  assertFiniteProbabilityArray(result, true)
  return result
}

function clampMass(value, label = 'DX probability') {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new RangeError(`${label} calculation produced NaN or infinity`)
  }
  if (value < -FULL_PRECISION_NEGATIVE_TOLERANCE) {
    throw new RangeError(`${label} calculation produced a negative value`)
  }
  return value < 0 ? 0 : value
}

/**
 * Number of critical blocks that can contribute to explicit score buckets.
 * The final score remainder is at least one, and the last array entry is the
 * overflow bucket, so t is explicit only while 10 * (yousei + t) + 1 is
 * smaller than workingLength - 1.
 */
function calculateYouseiDistribution(
  dice,
  critical,
  yousei,
  workingLength,
  requestedFftLength
) {
  const result = new Float64Array(workingLength)
  const overflowIndex = workingLength - 1
  const blockLength = getDxYouseiBlockLength(workingLength, yousei)

  if (blockLength === 0) {
    if (requestedFftLength !== undefined && requestedFftLength !== 0) {
      throw new RangeError('fftLength must be zero when no explicit Yousei blocks are modeled')
    }
    result[overflowIndex] = 1
    return result
  }

  const criticalProbability = (11 - critical) / 10
  const maximumCriticalCounts = new Float64Array(blockLength)
  const addedCriticalCounts = new Float64Array(blockLength)
  let previousTail = 1
  for (let criticalCount = 0; criticalCount < blockLength; criticalCount += 1) {
    const tail = maxGeometricTail(
      criticalCount,
      dice,
      criticalProbability
    )
    maximumCriticalCounts[criticalCount] = clampMass(
      previousTail - tail,
      'maximum critical count'
    )
    previousTail = tail
    addedCriticalCounts[criticalCount] = clampMass(
      negativeBinomialPmf(
        criticalCount,
        yousei,
        criticalProbability
      ),
      'Yousei critical count'
    )
  }

  const fftLength = getConvolutionFftLength(blockLength, blockLength)
  if (
    requestedFftLength !== undefined
    && requestedFftLength !== fftLength
  ) {
    throw new RangeError(
      `fftLength must equal ${fftLength} for Yousei block convolution`
    )
  }

  const estimatedBytes = (
    workingLength * 2 +
    blockLength * 2 +
    (2 * blockLength - 1) +
    fftLength * 4
  ) * Float64Array.BYTES_PER_ELEMENT
  if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes > DX_MAX_CALCULATION_BYTES) {
    throw new RangeError(
      `DX calculation exceeds the absolute safety limit of ${DX_MAX_CALCULATION_BYTES} bytes`
    )
  }
  const estimatedOperations =
    workingLength * Math.max(1, critical - 1) +
    3 * fftLength * Math.log2(fftLength)
  if (!Number.isFinite(estimatedOperations) || estimatedOperations > DX_MAX_CALCULATION_OPERATIONS) {
    throw new RangeError(
      `DX calculation exceeds the absolute safety limit of ${DX_MAX_CALCULATION_OPERATIONS} operations`
    )
  }

  const combined = convolveDistributions(
    maximumCriticalCounts,
    addedCriticalCounts,
    { fftLength }
  )
  const remainderProbability = 1 / (critical - 1)
  let explicitTotal = 0
  for (let criticalCount = 0; criticalCount < blockLength; criticalCount += 1) {
    const blockProbability = clampMass(
      combined[criticalCount],
      'Yousei block convolution'
    )
    const scoreBlock = yousei + criticalCount
    const blockStart = 10 * scoreBlock
    for (let remainder = 1; remainder < critical; remainder += 1) {
      const value = blockStart + remainder
      if (value >= overflowIndex) {
        continue
      }
      result[value] += blockProbability * remainderProbability
      explicitTotal += blockProbability * remainderProbability
    }
  }

  if (explicitTotal > 1 + FULL_PRECISION_NEGATIVE_TOLERANCE) {
    throw new RangeError('Yousei distribution explicit mass exceeds one')
  }
  result[overflowIndex] = calculateYouseiTailProbability(
    overflowIndex - 1,
    dice,
    critical,
    yousei
  )
  return result
}

function createPointDistribution(length, value) {
  const result = new Float64Array(length)
  const overflowIndex = length - 1
  result[value < overflowIndex ? value : overflowIndex] = 1
  return result
}

function assertFiniteProbabilityArray(distribution, requireTotal = false) {
  let total = 0
  for (let index = 0; index < distribution.length; index += 1) {
    const probability = distribution[index]
    if (!Number.isFinite(probability) || Number.isNaN(probability)) {
      throw new RangeError('DX probability calculation produced NaN or infinity')
    }
    if (probability < -FULL_PRECISION_NEGATIVE_TOLERANCE) {
      throw new RangeError('DX probability calculation produced a negative value')
    }
    total += probability
  }
  if (requireTotal && (!Number.isFinite(total) || total <= 0)) {
    throw new RangeError('DX probability calculation produced an invalid total')
  }
  return total
}

function normalizeFullPrecisionProbabilities(distribution) {
  const normalized = new Float64Array(distribution.length)
  let total = 0
  for (let index = 0; index < distribution.length; index += 1) {
    const probability = distribution[index]
    if (!Number.isFinite(probability) || Number.isNaN(probability)) {
      throw new RangeError('DX probability calculation produced NaN or infinity')
    }
    if (probability < -FULL_PRECISION_NEGATIVE_TOLERANCE) {
      throw new RangeError('DX probability calculation produced a negative value')
    }
    const nonNegative = probability < 0 ? 0 : probability
    normalized[index] = nonNegative
    total += nonNegative
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError('DX probability calculation produced an invalid total')
  }

  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] /= total
  }
  return normalized
}

export function calculateDxDistribution(params, options) {
  validateInput(params)
  const normalizedOptions = normalizeDxOptions(options)
  const {
    dice,
    critical,
    shihai = 0,
    yousei = 0,
  } = params
  if (normalizedOptions.fftLength !== undefined) {
    const expectedFftLength = shihai === 0
      ? getDxYouseiFftLength(
          normalizedOptions.workingLength,
          critical,
          yousei
        )
      : 0
    if (normalizedOptions.fftLength !== expectedFftLength) {
      throw new RangeError(
        `fftLength must equal ${expectedFftLength} for the requested DX distribution`
      )
    }
  }
  if (shihai === 0) {
    if (yousei === 0) {
      const estimatedOperations = getDxOperationEstimate(
        normalizedOptions.workingLength,
        critical
      )
      if (estimatedOperations > DX_MAX_CALCULATION_OPERATIONS) {
        throw new RangeError(
          `DX calculation exceeds the absolute safety limit of ${DX_MAX_CALCULATION_OPERATIONS} operations`
        )
      }
    }
  } else if (yousei > 0) {
    throw new RangeError(
      'score.yousei and score.shihai cannot both be non-zero in the current supported feature set'
    )
  }
  const rawDistribution =
    shihai !== 0
      ? calculateShihaiPositiveDistribution(
          dice,
          critical,
          shihai,
          normalizedOptions.workingLength
        )
      : dice === 0
        ? createPointDistribution(normalizedOptions.workingLength, 0)
        : yousei === 0
          ? calculateShihaiZeroDistribution(
              dice,
              critical,
              normalizedOptions.workingLength
            )
          : critical === DX_CRITICAL_MAX
            ? createPointDistribution(normalizedOptions.workingLength, 10)
            : calculateYouseiDistribution(
                dice,
                critical,
                yousei,
                normalizedOptions.workingLength,
                normalizedOptions.fftLength
              )

  return normalizeFullPrecisionProbabilities(rawDistribution)
}
