export const DX_DISTRIBUTION_SIZE = 2048
// The planner's default hard policy is deliberately lower than this direct
// API safety ceiling. Keep the ceiling explicit so a future planner policy
// can be changed without making an arbitrary array allocation safe by
// accident.
export const DX_MIN_DISTRIBUTION_SIZE = 2
export const DX_MAX_DISTRIBUTION_SIZE = 1 << 16
export const DX_DICE_COUNT = 100
export const DX_CRITICAL_MIN = 2
export const DX_CRITICAL_MAX = 11
export const DX_SHIHAI_MIN = 0
export const DX_SHIHAI_MAX = 19

const ROUNDING_UNIT = 1e-6
const MAX_BINOMIAL_N = DX_DICE_COUNT - 1
const FULL_PRECISION_NEGATIVE_TOLERANCE = 1e-12

const LEGACY_ROUNDING = 'legacy'
const UNROUNDED_ROUNDING = 'unrounded'

const binomialCoefficients = (() => {
  const table = []

  for (let n = 0; n <= MAX_BINOMIAL_N; n += 1) {
    const row = new Float64Array(n + 1)
    row[0] = 1
    row[n] = 1
    for (let k = 1; k < n; k += 1) {
      row[k] = table[n - 1][k - 1] + table[n - 1][k]
    }
    table.push(row)
  }

  return table
})()

function validateInput(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(
      'calculateDxDistribution expects { dice, critical, shihai }'
    )
  }

  const { dice, critical, shihai } = params
  if (
    !Number.isInteger(dice) ||
    dice < 0 ||
    dice >= DX_DICE_COUNT
  ) {
    throw new RangeError(
      `dice must be an integer between 0 and ${DX_DICE_COUNT - 1}`
    )
  }
  if (
    !Number.isInteger(critical) ||
    critical < DX_CRITICAL_MIN ||
    critical > DX_CRITICAL_MAX
  ) {
    throw new RangeError(
      `critical must be an integer between ${DX_CRITICAL_MIN} and ${DX_CRITICAL_MAX}`
    )
  }
  if (
    !Number.isInteger(shihai) ||
    shihai < DX_SHIHAI_MIN ||
    shihai > DX_SHIHAI_MAX
  ) {
    throw new RangeError(
      `shihai must be an integer between ${DX_SHIHAI_MIN} and ${DX_SHIHAI_MAX}`
    )
  }
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

  return {
    workingLength,
    rounding: normalizedRounding,
  }
}

function binomialTail(dice, required, probability) {
  if (required <= 0) {
    return 1
  }
  if (required > dice) {
    return 0
  }

  const coefficients = binomialCoefficients[dice]
  const complement = 1 - probability
  let result = 0
  for (let successes = required; successes <= dice; successes += 1) {
    result +=
      coefficients[successes] *
      probability ** successes *
      complement ** (dice - successes)
  }
  return result
}

function binomialProbabilities(dice, probability) {
  const result = new Float64Array(dice + 1)
  const coefficients = binomialCoefficients[dice]
  const complement = 1 - probability

  for (let successes = 0; successes <= dice; successes += 1) {
    result[successes] =
      coefficients[successes] *
      probability ** successes *
      complement ** (dice - successes)
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
  const { dice, critical, shihai } = params
  const rawDistribution =
    shihai === 0
      ? calculateShihaiZeroDistribution(
          dice,
          critical,
          normalizedOptions.workingLength,
          normalizedOptions.rounding === UNROUNDED_ROUNDING
        )
      : calculateShihaiPositiveDistribution(
          dice,
          critical,
          shihai,
          normalizedOptions.workingLength
        )

  assertFiniteProbabilityArray(rawDistribution, true)
  return normalizedOptions.rounding === UNROUNDED_ROUNDING
    ? normalizeFullPrecisionProbabilities(rawDistribution)
    : roundNormalizedProbabilities(rawDistribution)
}
