import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertSupportedScoreFeatures,
} from '../domain/InputDomain'
import {
  convolveDistributions,
  getConvolutionFftLength,
} from '../core/probability/FFT'

export const DX_DISTRIBUTION_SIZE = 2048
// The planner's default hard policy is deliberately lower than this direct
// API safety ceiling. Keep the ceiling explicit so a future planner policy
// can be changed without making an arbitrary array allocation safe by
// accident.
export const DX_MIN_DISTRIBUTION_SIZE = 2
export const DX_MAX_DISTRIBUTION_SIZE = 1 << 16
export const DX_CRITICAL_MIN = 2
export const DX_CRITICAL_MAX = 11
export const DX_SHIHAI_MIN = 0
// These are absolute implementation-safety limits, not game input limits.
// The planner normally rejects much smaller requests based on estimated
// memory/time, while direct callers still need a finite guard before a
// quadratic DP or an oversized typed-array allocation is attempted.
export const DX_MAX_CALCULATION_OPERATIONS = 2_000_000_000
export const DX_MAX_CALCULATION_BYTES = 512 * 1024 * 1024

const ROUNDING_UNIT = 1e-6
const FULL_PRECISION_NEGATIVE_TOLERANCE = 1e-12

const LEGACY_ROUNDING = 'legacy'
const UNROUNDED_ROUNDING = 'unrounded'

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

function logBinomialPmf(dice, successes, probability) {
  const failures = dice - successes
  let logCoefficient = 0
  for (let index = 1; index <= successes; index += 1) {
    logCoefficient += Math.log(failures + index) - Math.log(index)
  }
  return logCoefficient +
    successes * Math.log(probability) +
    failures * Math.log1p(-probability)
}

function binomialPmfAt(dice, successes, probability) {
  if (successes < 0 || successes > dice) {
    return 0
  }
  if (probability === 0) {
    return successes === 0 ? 1 : 0
  }
  if (probability === 1) {
    return successes === dice ? 1 : 0
  }
  return Math.exp(logBinomialPmf(dice, successes, probability))
}

export function normalizeDxOptions(options) {
  if (options === undefined) {
    return {
      workingLength: DX_DISTRIBUTION_SIZE,
      rounding: LEGACY_ROUNDING,
    }
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      'calculateDxDistribution options must be an object when supplied'
    )
  }

  const hasWorkingLength = options.workingLength !== undefined
  const hasSize = options.size !== undefined
  const suppliedLength = hasWorkingLength
    ? options.workingLength
    : hasSize
      ? options.size
      : undefined
  if (
    hasWorkingLength &&
    hasSize &&
    options.workingLength !== options.size
  ) {
    throw new RangeError('workingLength and size must match when both are supplied')
  }
  const workingLength = suppliedLength === undefined
    ? DX_DISTRIBUTION_SIZE
    : suppliedLength
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

  const suppliedRounding = options.rounding !== undefined
    ? options.rounding
    : options.roundingMode !== undefined
      ? options.roundingMode
      : options.fullPrecision
        ? UNROUNDED_ROUNDING
        : undefined
  const rounding = suppliedRounding ?? (
    suppliedLength === undefined
      ? LEGACY_ROUNDING
      : UNROUNDED_ROUNDING
  )
  const normalizedRounding = {
    legacy: LEGACY_ROUNDING,
    rounded: LEGACY_ROUNDING,
    'six-decimal': LEGACY_ROUNDING,
    'six-decimals': LEGACY_ROUNDING,
    'round-to-six-decimals': LEGACY_ROUNDING,
    compatibility: LEGACY_ROUNDING,
    compat: LEGACY_ROUNDING,
    unrounded: UNROUNDED_ROUNDING,
    'full-precision': UNROUNDED_ROUNDING,
    fullPrecision: UNROUNDED_ROUNDING,
    none: UNROUNDED_ROUNDING,
  }[rounding]
  if (!normalizedRounding) {
    throw new RangeError(
      'rounding must be legacy/compatibility or unrounded/full-precision'
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
    rounding: normalizedRounding,
    ...(fftLength === undefined ? {} : { fftLength }),
  }
}

function binomialTail(dice, required, probability) {
  if (required <= 0) {
    return 1
  }
  if (required > dice) {
    return 0
  }

  if (probability === 0) {
    return 0
  }
  if (probability === 1) {
    return 1
  }

  // Start at the mode instead of at k=0.  For a large dice count, q^n can
  // underflow even though the central mass is still representable; a
  // mode-centred recurrence avoids losing the entire distribution in that
  // case while retaining O(n) time and O(1) working memory.
  const mode = Math.min(dice, Math.floor((dice + 1) * probability))
  let mass = binomialPmfAt(dice, mode, probability)
  if (mode >= required) {
    let lowerTail = 0
    for (let successes = mode; successes > 0; successes -= 1) {
      if (successes < required) {
        lowerTail += mass
      }
      mass *= successes /
        (dice - successes + 1) *
        (1 - probability) /
        probability
    }
    lowerTail += mass
    return Math.max(0, Math.min(1, 1 - lowerTail))
  }

  // required is above the mode, so walk upward and sum the requested tail.
  for (let successes = mode; successes < required; successes += 1) {
    mass *= (dice - successes) / (successes + 1) * probability / (1 - probability)
  }
  let result = mass
  for (let successes = required; successes < dice; successes += 1) {
    mass *= (dice - successes) / (successes + 1) * probability / (1 - probability)
    result += mass
  }
  return Math.max(0, Math.min(1, result))
}

function binomialProbabilities(dice, probability) {
  const result = new Float64Array(dice + 1)
  if (probability === 0) {
    result[0] = 1
    return result
  }
  if (probability === 1) {
    result[dice] = 1
    return result
  }

  const mode = Math.min(dice, Math.floor((dice + 1) * probability))
  result[mode] = binomialPmfAt(dice, mode, probability)
  for (let successes = mode; successes > 0; successes -= 1) {
    result[successes - 1] = result[successes] *
      successes / (dice - successes + 1) *
      (1 - probability) / probability
  }
  for (let successes = mode; successes < dice; successes += 1) {
    result[successes + 1] = result[successes] *
      (dice - successes) / (successes + 1) *
      probability / (1 - probability)
  }

  let total = 0
  for (const mass of result) {
    total += mass
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError('binomial probability calculation produced an invalid total')
  }
  if (Math.abs(total - 1) > Number.EPSILON) {
    for (let successes = 0; successes <= dice; successes += 1) {
      result[successes] /= total
    }
  }
  return result
}

function getTerminalOrderStatistic(dice, shihai, critical, workingLength) {
  const result = new Float64Array(workingLength)
  const rankFromLargest = shihai + 1

  for (let face = 1; face < critical; face += 1) {
    const atLeastFace = binomialTail(
      dice,
      rankFromLargest,
      (11 - face) / 10
    )
    const aboveFace = binomialTail(
      dice,
      rankFromLargest,
      (10 - face) / 10
    )
    result[face] = atLeastFace - aboveFace
  }

  return result
}

function geometricSum(probability, terms) {
  return (1 - probability ** terms) / (1 - probability)
}

function oneDieCumulative(value, critical) {
  if (value <= 0) {
    return 0
  }

  if (critical === DX_CRITICAL_MAX && value >= 10) {
    return 1
  }

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical && face <= value; face += 1) {
    const terms = Math.floor((value - face) / 10) + 1
    result += 0.1 * geometricSum(criticalProbability, terms)
  }
  return result
}

function oneDieTail(value, critical) {
  if (value < 0) {
    return 1
  }

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical; face += 1) {
    const firstExcludedRepeat =
      value < face ? 0 : Math.floor((value - face) / 10) + 1
    if (criticalProbability === 0) {
      if (firstExcludedRepeat === 0) {
        result += 0.1
      }
      continue
    }
    result +=
      0.1 *
      criticalProbability ** firstExcludedRepeat /
      (1 - criticalProbability)
  }
  return Math.max(0, Math.min(1, result))
}

function calculateShihaiZeroDistribution(
  dice,
  critical,
  workingLength,
  stableTail = false
) {
  const result = new Float64Array(workingLength)
  if (dice === 0) {
    result[0] = 1
    return result
  }

  // For shihai=0, the result is the maximum of dice independent rolls.
  // If F_c(x) is the one-die cumulative distribution, then
  // P(V_{n,c} <= x) = F_c(x)^n.
  let previousCumulative = 0
  let previousTail = 1
  let total = 0
  const overflowIndex = workingLength - 1
  for (let value = 0; value < overflowIndex; value += 1) {
    if (stableTail) {
      const oneDieTailProbability = oneDieTail(value, critical)
      const tail = oneDieTailProbability === 1
        ? 1
        : -Math.expm1(
            dice * Math.log1p(-oneDieTailProbability)
          )
      result[value] = previousTail - tail
      previousTail = tail
    } else {
      const cumulative = oneDieCumulative(value, critical) ** dice
      result[value] = cumulative - previousCumulative
      previousCumulative = cumulative
    }
    total += result[value]
  }
  result[overflowIndex] = stableTail ? previousTail : 1 - total
  return result
}

function addShifted(target, source, shift, weight) {
  for (let value = shift; value < target.length; value += 1) {
    target[value] += weight * source[value - shift]
  }
}

function solveSelfTransition(stage, criticalProbability, dice) {
  const result = new Float64Array(stage.length)
  const allCriticalProbability = criticalProbability ** dice
  const overflowIndex = stage.length - 1

  // d[x] = stage[x] + p_c^n * d[x-10].  The final bucket is replaced
  // after the recurrence so all mass beyond the working range is absorbed.
  for (let value = 0; value < stage.length; value += 1) {
    result[value] =
      stage[value] +
      (value >= 10 ? allCriticalProbability * result[value - 10] : 0)
  }

  let total = 0
  for (let value = 0; value < overflowIndex; value += 1) {
    total += result[value]
  }
  result[overflowIndex] = 1 - total
  assertFiniteProbabilityArray(result, true)
  return result
}

function calculateShihaiPositiveDistribution(
  dice,
  critical,
  shihai,
  workingLength
) {
  if (dice <= shihai) {
    const result = new Float64Array(workingLength)
    result[0] = 1
    return result
  }

  const stages = dice - shihai
  const transitionCount = safeProduct(stages, stages + 1, 'DX transition count') / 2
  const estimatedOperations = safeProduct(
    workingLength,
    transitionCount + stages * 4,
    'DX operation estimate'
  )
  const estimatedBytes = safeProduct(
    dice + 1,
    safeProduct(workingLength, Float64Array.BYTES_PER_ELEMENT, 'DX array size'),
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

  const resultByDice = Array.from(
    { length: dice + 1 },
    () => new Float64Array(workingLength)
  )

  for (let currentDice = 0; currentDice <= Math.min(dice, shihai); currentDice += 1) {
    resultByDice[currentDice][0] = 1
  }

  const criticalProbability = (11 - critical) / 10
  for (let currentDice = shihai + 1; currentDice <= dice; currentDice += 1) {
    const stage = getTerminalOrderStatistic(
      currentDice,
      shihai,
      critical,
      workingLength
    )
    const criticalCounts = binomialProbabilities(
      currentDice,
      criticalProbability
    )

    // A non-terminal roll with k critical dice continues from the already
    // computed k-dice state.  The all-critical k=currentDice case is the
    // self-transition handled by solveSelfTransition below.
    for (
      let criticalDice = shihai + 1;
      criticalDice < currentDice;
      criticalDice += 1
    ) {
      addShifted(
        stage,
        resultByDice[criticalDice],
        10,
        criticalCounts[criticalDice]
      )
    }

    resultByDice[currentDice] = solveSelfTransition(
      stage,
      criticalProbability,
      currentDice
    )
    assertFiniteProbabilityArray(resultByDice[currentDice], true)
  }

  return resultByDice[dice]
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

function maxGeometricTail(maxCriticalCount, dice, criticalProbability) {
  if (maxCriticalCount < 0) {
    return 1
  }
  if (dice === 0 || criticalProbability === 0) {
    return 0
  }

  const oneDieTail = criticalProbability ** (maxCriticalCount + 1)
  return Math.max(
    0,
    Math.min(
      1,
      -Math.expm1(dice * Math.log1p(-oneDieTail))
    )
  )
}

function negativeBinomialLogStep(logPmf, sum, yousei, criticalProbability) {
  return logPmf +
    Math.log(criticalProbability) +
    Math.log(sum + yousei) -
    Math.log(sum + 1)
}

function negativeBinomialTailFrom(
  logPmf,
  sum,
  yousei,
  criticalProbability
) {
  let result = 0
  let compensation = 0
  const logMinimum = Math.log(Number.MIN_VALUE)

  while (true) {
    const pmf = Math.exp(logPmf)
    if (pmf > 0) {
      const corrected = pmf - compensation
      const next = result + corrected
      compensation = next - result - corrected
      result = next
    }

    const logRatio = negativeBinomialLogStep(
      0,
      sum,
      yousei,
      criticalProbability
    )
    const nextLogPmf = logPmf + logRatio
    const nextPmf = Math.exp(nextLogPmf)
    if (
      logRatio < 0
      && (
        nextPmf === 0
        || nextPmf <= Number.EPSILON * Math.max(result, Number.MIN_VALUE)
      )
    ) {
      break
    }
    if (logRatio < 0 && nextLogPmf < logMinimum) {
      break
    }

    logPmf = nextLogPmf
    sum += 1
  }

  return Math.max(0, Math.min(1, result))
}

function maxPlusNegativeBinomialTail(
  threshold,
  dice,
  yousei,
  criticalProbability
) {
  if (threshold < 0) {
    return 1
  }
  if (criticalProbability === 0) {
    return 0
  }

  let logPmf = yousei * Math.log1p(-criticalProbability)
  let result = 0
  let compensation = 0
  for (let sum = 0; sum <= threshold; sum += 1) {
    const pmf = Math.exp(logPmf)
    const term =
      pmf * maxGeometricTail(threshold - sum, dice, criticalProbability)
    if (term > 0) {
      const corrected = term - compensation
      const next = result + corrected
      compensation = next - result - corrected
      result = next
    }
    logPmf = negativeBinomialLogStep(
      logPmf,
      sum,
      yousei,
      criticalProbability
    )
  }

  return Math.max(
    0,
    Math.min(
      1,
      result + negativeBinomialTailFrom(
        logPmf,
        threshold + 1,
        yousei,
        criticalProbability
      )
    )
  )
}

function calculateYouseiOverflowProbability(
  explicitMax,
  dice,
  critical,
  yousei
) {
  if (dice === 0) {
    return 0
  }

  const criticalProbability = (11 - critical) / 10
  const remainderCount = critical - 1
  let result = 0
  let previousThreshold = null
  let multiplicity = 0
  for (let remainder = 1; remainder <= remainderCount; remainder += 1) {
    const threshold =
      Math.floor((explicitMax - remainder) / 10) - yousei
    if (threshold === previousThreshold) {
      multiplicity += 1
      continue
    }
    if (previousThreshold !== null) {
      result += multiplicity * maxPlusNegativeBinomialTail(
        previousThreshold,
        dice,
        yousei,
        criticalProbability
      )
    }
    previousThreshold = threshold
    multiplicity = 1
  }
  if (previousThreshold !== null) {
    result += multiplicity * maxPlusNegativeBinomialTail(
      previousThreshold,
      dice,
      yousei,
      criticalProbability
    )
  }

  return Math.max(0, Math.min(1, result / remainderCount))
}

// Lanczos approximation for log(Gamma(z)).  All callers use positive integer
// arguments, but keeping the reflection branch makes this helper safe to
// reuse for diagnostics without factorial-sized intermediate values.
const LOG_GAMMA_COEFFICIENTS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
]

function logGamma(value) {
  if (value < 0.5) {
    return Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * value)) -
      logGamma(1 - value)
  }

  let shifted = value - 1
  let sum = 0.99999999999980993
  for (let index = 0; index < LOG_GAMMA_COEFFICIENTS.length; index += 1) {
    sum += LOG_GAMMA_COEFFICIENTS[index] / (shifted + index + 1)
  }
  const g = 7
  const t = shifted + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(t) -
    t +
    Math.log(sum)
}

function negativeBinomialPmf(sum, yousei, criticalProbability) {
  if (yousei === 0) {
    return sum === 0 ? 1 : 0
  }
  if (criticalProbability === 0) {
    return sum === 0 ? 1 : 0
  }

  const logPmf =
    logGamma(sum + yousei) -
    logGamma(yousei) -
    logGamma(sum + 1) +
    yousei * Math.log1p(-criticalProbability) +
    sum * Math.log(criticalProbability)
  return Math.exp(logPmf)
}

/**
 * Number of critical blocks that can contribute to explicit score buckets.
 * The final score remainder is at least one, and the last array entry is the
 * overflow bucket, so t is explicit only while 10 * (yousei + t) + 1 is
 * smaller than workingLength - 1.
 */
export function getDxYouseiBlockLength(workingLength, yousei) {
  if (!Number.isSafeInteger(workingLength) || workingLength < DX_MIN_DISTRIBUTION_SIZE) {
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
  result[overflowIndex] = calculateYouseiOverflowProbability(
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

function roundToSixDecimals(value) {
  const scaled = Math.abs(value) / ROUNDING_UNIT
  const lower = Math.floor(scaled)
  const fraction = scaled - lower
  const roundedInteger =
    fraction > 0.5 ||
    (fraction === 0.5 && lower % 2 === 1)
      ? lower + 1
      : lower
  return roundedInteger * ROUNDING_UNIT
}

function roundNormalizedProbabilities(distribution) {
  const rounded = new Float64Array(distribution.length)
  for (let index = 0; index < distribution.length; index += 1) {
    rounded[index] = roundToSixDecimals(distribution[index])
  }

  let total = 0
  for (const probability of rounded) {
    total += probability
  }

  while (Math.abs(total - 1) > ROUNDING_UNIT / 2) {
    const errors = new Float64Array(distribution.length)
    let index = 0
    if (total > 1) {
      let largestError = -Infinity
      for (let candidate = 0; candidate < distribution.length; candidate += 1) {
        errors[candidate] = rounded[candidate] - distribution[candidate]
        if (errors[candidate] > largestError) {
          largestError = errors[candidate]
          index = candidate
        }
      }
      rounded[index] -= ROUNDING_UNIT
      total -= ROUNDING_UNIT
    } else {
      let smallestError = Infinity
      for (let candidate = 0; candidate < distribution.length; candidate += 1) {
        errors[candidate] = rounded[candidate] - distribution[candidate]
        if (errors[candidate] < smallestError) {
          smallestError = errors[candidate]
          index = candidate
        }
      }
      rounded[index] += ROUNDING_UNIT
      total += ROUNDING_UNIT
    }
  }

  for (let index = 0; index < rounded.length; index += 1) {
    if (rounded[index] === 0) {
      rounded[index] = 0
    }
  }
  return rounded
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
      const estimatedOperations = safeProduct(
        dice + 1,
        Math.max(1, critical - 1),
        'DX operation estimate'
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
              normalizedOptions.workingLength,
              normalizedOptions.rounding === UNROUNDED_ROUNDING
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

  assertFiniteProbabilityArray(rawDistribution, true)
  return normalizedOptions.rounding === UNROUNDED_ROUNDING
    ? normalizeFullPrecisionProbabilities(rawDistribution)
    : roundNormalizedProbabilities(rawDistribution)
}
