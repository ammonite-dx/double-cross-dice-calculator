import { DX_MAX_DISTRIBUTION_SIZE } from './DxCalculator'

const DEFAULT_ERROR_BUDGET = 1e-8

/**
 * @typedef {'score' | 'check' | 'attack' | 'backtrack'} PlannerOperation
 * @typedef {'published-bucket' | 'full-tail'} ScorePropagation
 * @typedef {
 *   'exact-max' |
 *   'exact-yousei' |
 *   'conservative-max-bound' |
 *   'conservative-union-bound'
 * } TailModel
 *
 * @typedef {Object} ScoreInput
 * @property {number} dice
 * @property {number} critical
 * @property {number} [shihai]
 * @property {number} [yousei]
 * @property {number} [skill]
 *
 * @typedef {Object} AttackInput
 * @property {number} dice
 * @property {number} value
 * @property {number} [kazanari]
 *
 * @typedef {Object} DefenceInput
 * @property {number} dice
 * @property {number} value
 *
 * @typedef {Object} DisplayInput
 * @property {number} [min]
 * @property {number} [max]
 *
 * @typedef {Object} RangePolicy
 * @property {ScorePropagation} [scorePropagation]
 * @property {number} [calculationMax]
 * @property {{ total?: number, scoreTail?: number }} [errorBudget]
 * @property {{ defaultMin?: number, defaultMax?: number, maxPoints?: number }} [display]
 * @property {{
 *   warning?: {
 *     estimatedTimeMs?: number,
 *     estimatedMemoryBytes?: number,
 *     workingLength?: number,
 *     fftLength?: number,
 *   },
 *   hard?: {
 *     estimatedTimeMs?: number,
 *     estimatedMemoryBytes?: number,
 *     workingLength?: number,
 *     fftLength?: number,
 *   },
 * }} [limits]
 * @property {{
 *   dxOperationsPerMs?: number,
 *   fftOperationsPerMs?: number,
 *   damageOperationsPerMs?: number,
 *   backtrackOperationsPerMs?: number,
 * }} [costModel]
 *
 * @typedef {Object} TailCertificate
 * @property {TailModel} model
 * @property {'dx-tail'} kind
 * @property {false} finiteSupport
 * @property {number} requested
 * @property {number} cutoff
 * @property {number} bound
 * @property {boolean} reachable
 * @property {number} modeledMax
 * @property {string} meaning
 *
 * @typedef {Object} OverflowInfo
 * @property {'dx-tail' | 'finite-support' | 'display-bucket' | 'asset'} type
 * @property {boolean} finiteSupport
 * @property {number | null} lowerBound
 * @property {number | null} bound
 * @property {string} meaning
 *
 * @typedef {Object} OverflowSummary
 * @property {OverflowInfo | null} score Multi-score summaries use a null lowerBound and sum individual bounds.
 * @property {OverflowInfo | null} damage
 * @property {OverflowInfo} display
 * @property {OverflowInfo | null} backtrack
 *
 * @typedef {Object} ScoreRangePlan
 * @property {ScoreInput} params
 * @property {Object} support
 * @property {TailCertificate} tail
 * @property {number} workingMax
 * @property {number} workingLength Number of entries including the DX tail bucket.
 * @property {number} outputMax
 * @property {number} publishedOutputMax
 * @property {number} oneDieCutoff Deprecated diagnostic cutoff for the
 *   standalone 1D10 distribution; it no longer determines FFT length.
 * @property {number} fftLength
 * @property {number} operations
 * @property {number} fftOperations
 * @property {number} float64Bytes
 * @property {false} finiteSupport
 *
 * @typedef {Object} DamageRangePlan
 * @property {number} attackDice
 * @property {number} attackValue
 * @property {number} kazanari
 * @property {number} defenceDice
 * @property {number} defenceValue
 * @property {number} fixedDifference
 * @property {number} maxDamageDice
 * @property {Object} support
 * @property {number} rawSupportMax
 * @property {number} rawMax
 * @property {number} workingMax
 * @property {number} workingLength
 * @property {number} defenceMax
 * @property {number} fftLength
 * @property {number} defenceFftLength
 * @property {number} operations
 * @property {number} damageOperations
 * @property {number} fftOperations
 * @property {number} float64Bytes
 * @property {true} finiteSupport
 * @property {ScorePropagation} scoreValueMode
 * @property {number} scoreValueUpperBound
 *
 * @typedef {Object} BacktrackRangePlan
 * @property {Object} params
 * @property {Object} support
 * @property {number} maxDice
 * @property {number} rawSupportMax
 * @property {number} workingMax
 * @property {number} workingLength
 * @property {number} fftLength
 * @property {number} operations
 * @property {number} float64Bytes
 * @property {true} finiteSupport
 * @property {boolean} assetOverflow
 * @property {number} assetOverflowLowerBound
 *
 * @typedef {Object} ResourceEstimate
 * @property {number} operations
 * @property {number} timeMs
 * @property {number} dxTimeMs
 * @property {number} damageTimeMs
 * @property {number} fftTimeMs
 * @property {number} float64Bytes
 * @property {number} scoreOperations
 * @property {number} scoreFftOperations
 * @property {number} damageOperations
 * @property {number} damageFftOperations
 * @property {number} [backtrackOperations]
 * @property {number} [backtrackTimeMs]
 *
 * @typedef {Object} RangePlan
 * @property {boolean} accepted
 * @property {PlannerOperation} operation
 * @property {{ score: ScorePropagation, calculationMax: number }} propagation
 * @property {{ min: number, max: number, points: number, overflowLowerBound: number }} display
 * @property {Array<ScoreRangePlan>} scores
 * @property {DamageRangePlan | null} damage
 * @property {BacktrackRangePlan | null} backtrack
 * @property {ResourceEstimate} estimates
 * @property {Object} errorBudget
 * @property {Object} overflow
 * @property {OverflowSummary} overflowInfo
 * @property {Array<Object>} warnings
 * @property {Array<string>} [rejectionReasons]
 */

/**
 * The default keeps the current published-bucket contract and display range.
 * Resource thresholds are provisional policy inputs, not UI input limits.
 */
export const DEFAULT_POLICY = {
  // Preserve the current public-score-to-damage contract.
  scorePropagation: 'published-bucket',
  calculationMax: 1022,
  errorBudget: {
    total: DEFAULT_ERROR_BUDGET,
    scoreTail: 8e-9,
  },
  display: {
    defaultMin: 0,
    defaultMax: 999,
    maxPoints: 1000,
  },
  limits: {
    warning: {
      estimatedTimeMs: 50,
      estimatedMemoryBytes: 32 * 1024 * 1024,
      workingLength: 8192,
      fftLength: 16384,
    },
    hard: {
      estimatedTimeMs: 200,
      estimatedMemoryBytes: 64 * 1024 * 1024,
      workingLength: 16384,
      fftLength: 32768,
    },
  },
  // These coefficients remain injectable until the supported device matrix
  // has been calibrated with production measurements.
  costModel: {
    dxOperationsPerMs: 1_000_000,
    fftOperationsPerMs: 8_000_000,
    damageOperationsPerMs: 250_000,
    backtrackOperationsPerMs: 1_000_000,
  },
}

function integer(value, name) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer`)
  }
  return value
}

function nonNegativeInteger(value, name) {
  integer(value, name)
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative`)
  }
  return value
}

function positiveInteger(value, name) {
  integer(value, name)
  if (value <= 0) {
    throw new RangeError(`${name} must be positive`)
  }
  return value
}

function positiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
  return value
}

function nonNegativeNumber(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`)
  }
  return value
}

function probability(value, name) {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
  return value
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value
}

export function nextPowerOfTwo(value) {
  positiveInteger(value, 'value')
  let result = 1
  while (result < value) {
    if (result > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError('value is too large for a power-of-two length')
    }
    result *= 2
  }
  return result
}

function mergePolicy(policy) {
  const supplied = policy ?? {}
  object(supplied, 'policy')

  const merged = {
    ...DEFAULT_POLICY,
    ...supplied,
    errorBudget: {
      ...DEFAULT_POLICY.errorBudget,
      ...(supplied.errorBudget ?? {}),
    },
    display: {
      ...DEFAULT_POLICY.display,
      ...(supplied.display ?? {}),
    },
    limits: {
      warning: {
        ...DEFAULT_POLICY.limits.warning,
        ...(supplied.limits?.warning ?? {}),
      },
      hard: {
        ...DEFAULT_POLICY.limits.hard,
        ...(supplied.limits?.hard ?? {}),
      },
    },
    costModel: {
      ...DEFAULT_POLICY.costModel,
      ...(supplied.costModel ?? {}),
    },
  }

  if (!['published-bucket', 'full-tail'].includes(merged.scorePropagation)) {
    throw new RangeError(
      'policy.scorePropagation must be published-bucket or full-tail'
    )
  }
  nonNegativeInteger(merged.calculationMax, 'policy.calculationMax')

  probability(merged.errorBudget.total, 'policy.errorBudget.total')
  probability(merged.errorBudget.scoreTail, 'policy.errorBudget.scoreTail')
  if (merged.errorBudget.scoreTail > merged.errorBudget.total) {
    throw new RangeError(
      'policy.errorBudget.scoreTail must not exceed policy.errorBudget.total'
    )
  }

  nonNegativeInteger(merged.display.defaultMin, 'policy.display.defaultMin')
  nonNegativeInteger(merged.display.defaultMax, 'policy.display.defaultMax')
  nonNegativeInteger(merged.display.maxPoints, 'policy.display.maxPoints')
  if (merged.display.defaultMax < merged.display.defaultMin) {
    throw new RangeError(
      'policy.display.defaultMax must be greater than or equal to defaultMin'
    )
  }

  const metricNames = [
    'estimatedTimeMs',
    'estimatedMemoryBytes',
    'workingLength',
    'fftLength',
  ]
  for (const thresholdName of ['warning', 'hard']) {
    for (const metricName of ['estimatedTimeMs', 'estimatedMemoryBytes']) {
      nonNegativeNumber(
        merged.limits[thresholdName][metricName],
        `policy.limits.${thresholdName}.${metricName}`
      )
    }
    for (const metricName of ['workingLength', 'fftLength']) {
      nonNegativeInteger(
        merged.limits[thresholdName][metricName],
        `policy.limits.${thresholdName}.${metricName}`
      )
    }
  }
  for (const metricName of metricNames) {
    if (
      merged.limits.warning[metricName] >
      merged.limits.hard[metricName]
    ) {
      throw new RangeError(
        `policy.limits.warning.${metricName} must not exceed the hard limit`
      )
    }
  }

  for (const name of [
    'dxOperationsPerMs',
    'fftOperationsPerMs',
    'damageOperationsPerMs',
    'backtrackOperationsPerMs',
  ]) {
    positiveNumber(merged.costModel[name], `policy.costModel.${name}`)
  }

  return merged
}

function geometricSum(probabilityValue, terms) {
  if (terms <= 0) {
    return 0
  }
  if (probabilityValue === 1) {
    return terms
  }
  return (1 - probabilityValue ** terms) / (1 - probabilityValue)
}

function clampProbability(value) {
  // NaN means the certificate calculation failed; endpoint infinities are
  // explicit probability limits rather than errors.
  if (Number.isNaN(value)) {
    throw new RangeError('probability calculation produced NaN')
  }
  if (value === Infinity) {
    return 1
  }
  if (value === -Infinity) {
    return 0
  }
  if (!Number.isFinite(value)) {
    throw new RangeError('probability calculation produced a non-finite value')
  }
  return Math.max(0, Math.min(1, value))
}

function maxGeometricTail(maxL, dice, criticalProbability) {
  if (maxL < 0) {
    return 1
  }
  if (criticalProbability === 0) {
    return 0
  }

  const tailOfOneDie = criticalProbability ** (maxL + 1)
  return clampProbability(
    -Math.expm1(dice * Math.log1p(-tailOfOneDie))
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
  criticalProbability,
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

    const logRatio =
      Math.log(criticalProbability) +
      Math.log(sum + yousei) -
      Math.log(sum + 1)
    const nextLogPmf = logPmf + logRatio
    const nextPmf = Math.exp(nextLogPmf)
    if (
      logRatio < 0 &&
      (
        nextPmf === 0 ||
        nextPmf <= Number.EPSILON * Math.max(result, Number.MIN_VALUE)
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

  return clampProbability(result)
}

// T = M + S_y, where M is the maximum of the geometric L values and S_y is
// their y-term negative-binomial sum. This evaluates P(T > threshold)
// directly, so a tiny tail is not obtained by subtracting a near-one CDF.
// maxGeometricTail uses expm1 on the max CDF complement, avoiding the PMF/CDF
// cancellation that would occur if adjacent near-one max CDF values were
// subtracted.
function maxPlusNegativeBinomialTail(
  threshold,
  dice,
  yousei,
  criticalProbability,
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
      criticalProbability,
    )
  }

  result += negativeBinomialTailFrom(
    logPmf,
    threshold + 1,
    yousei,
    criticalProbability,
  )
  return clampProbability(result)
}

function exactYouseiTailBound(value, dice, critical, yousei) {
  if (dice === 0) {
    return 0
  }

  const integerValue = Math.floor(value)
  const remainderCount = critical - 1
  const criticalProbability = (11 - critical) / 10

  // A_y = 10(y + T) + R, with R uniform on 1..critical-1. There are at
  // most two distinct T thresholds among the possible remainders.
  let result = 0
  let previousThreshold = null
  let multiplicity = 0
  for (let remainder = 1; remainder <= remainderCount; remainder += 1) {
    const threshold =
      Math.floor((integerValue - remainder) / 10) - yousei
    if (threshold === previousThreshold) {
      multiplicity += 1
      continue
    }
    if (previousThreshold !== null) {
      result += multiplicity * maxPlusNegativeBinomialTail(
        previousThreshold,
        dice,
        yousei,
        criticalProbability,
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
      criticalProbability,
    )
  }

  return clampProbability(result / remainderCount)
}

export function oneDieCumulative(value, critical) {
  if (value <= 0) {
    return 0
  }
  if (!Number.isInteger(critical) || critical < 2 || critical > 11) {
    throw new RangeError('critical must be an integer between 2 and 11')
  }

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical && face <= value; face += 1) {
    const terms = Math.floor((value - face) / 10) + 1
    result += 0.1 * geometricSum(criticalProbability, terms)
  }
  return Math.min(1, result)
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

export function maxTailBound(value, dice, critical) {
  nonNegativeInteger(dice, 'dice')
  if (!Number.isSafeInteger(critical) || critical < 2 || critical > 11) {
    throw new RangeError('critical must be an integer between 2 and 11')
  }
  if (Number.isNaN(value)) {
    throw new RangeError('score.value must not be NaN')
  }
  if (dice === 0) {
    return 0
  }
  const tailOfOneDie = oneDieTail(Math.floor(value), critical)
  if (tailOfOneDie === 1) {
    return 1
  }
  return clampProbability(
    -Math.expm1(dice * Math.log1p(-tailOfOneDie))
  )
}

// For shihai>0, the maximum-of-all-dice tail is deliberately conservative.
// It is independent of the finite work array and therefore suitable for a
// planner certificate even though the production DP uses an order statistic.
export function scoreTailBound(value, params) {
  object(params, 'score')
  const { dice, critical, shihai = 0, yousei = 0 } = params
  nonNegativeInteger(dice, 'score.dice')
  nonNegativeInteger(shihai, 'score.shihai')
  nonNegativeInteger(yousei, 'score.yousei')
  if (!Number.isSafeInteger(critical) || critical < 2 || critical > 11) {
    throw new RangeError('score.critical must be between 2 and 11')
  }
  if (Number.isNaN(value)) {
    throw new RangeError('score.value must not be NaN')
  }
  if (yousei === 0) {
    return maxTailBound(value, dice, critical)
  }

  if (shihai === 0) {
    if (value === Infinity) {
      return 0
    }
    if (value === -Infinity) {
      return 1
    }
    return exactYouseiTailBound(value, dice, critical, yousei)
  }

  const adjusted = Math.floor((value - 9 * yousei) / (yousei + 1))
  if (adjusted <= 0) {
    return 1
  }
  return Math.min(
    1,
    maxTailBound(adjusted, dice, critical) +
      yousei * maxTailBound(adjusted, 1, critical)
  )
}

export function findTailCutoff(params, epsilon, maxSearch = 1 << 20) {
  object(params, 'score')
  probability(epsilon, 'epsilon')
  positiveInteger(maxSearch, 'maxSearch')

  const cache = new Map()
  const evaluate = (value) => {
    if (!cache.has(value)) {
      cache.set(value, scoreTailBound(value, params))
    }
    return cache.get(value)
  }

  let high = 1
  while (high < maxSearch && evaluate(high) > epsilon) {
    high *= 2
  }
  if (evaluate(high) > epsilon) {
    return {
      reachable: false,
      cutoff: high,
      bound: evaluate(high),
    }
  }

  let low = -1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (evaluate(middle) <= epsilon) {
      high = middle
    } else {
      low = middle
    }
  }
  return {
    reachable: true,
    cutoff: high,
    bound: evaluate(high),
  }
}

function normalizeDisplay(display, policy) {
  const supplied = display ?? {}
  object(supplied, 'display')
  const min = supplied.min ?? policy.display.defaultMin
  const max = supplied.max ?? policy.display.defaultMax
  nonNegativeInteger(min, 'display.min')
  nonNegativeInteger(max, 'display.max')
  if (max < min) {
    throw new RangeError('display.max must be greater than or equal to display.min')
  }
  return {
    min,
    max,
    points: max - min + 1,
    overflowLowerBound: max + 1,
  }
}

function addWarning(warnings, code, severity, message, value, limit) {
  warnings.push({ code, severity, message, value, limit })
}

function classifyMetric(
  warnings,
  accepted,
  code,
  value,
  warningLimit,
  hardLimit,
  unit
) {
  if (value > hardLimit) {
    addWarning(
      warnings,
      code,
      'reject',
      `${code} exceeds the hard limit`,
      value,
      hardLimit
    )
    return false
  }
  if (value > warningLimit) {
    addWarning(
      warnings,
      code,
      'warning',
      `${code} exceeds the warning limit (${unit})`,
      value,
      warningLimit
    )
  }
  return accepted
}

function scoreOperationCount(plan) {
  const dice = plan.params.dice
  const size = plan.workingLength
  if (plan.params.shihai === 0) {
    return size * Math.max(1, plan.params.critical - 1)
  }
  const stages = Math.max(0, dice - plan.params.shihai)
  const transitionCount = stages * (stages + 1) / 2
  return size * (transitionCount + stages * 4)
}

function fftOperationCount(length) {
  if (!length) {
    return 0
  }
  return 3 * length * Math.log2(length)
}

function normalizeScore(params, name) {
  object(params, name)
  const normalized = {
    dice: nonNegativeInteger(params.dice, `${name}.dice`),
    critical: integer(params.critical, `${name}.critical`),
    shihai: nonNegativeInteger(params.shihai ?? 0, `${name}.shihai`),
    yousei: nonNegativeInteger(params.yousei ?? 0, `${name}.yousei`),
    skill: integer(params.skill ?? 0, `${name}.skill`),
  }
  if (normalized.critical < 2 || normalized.critical > 11) {
    throw new RangeError(`${name}.critical must be between 2 and 11`)
  }
  return normalized
}

function planScore(params, display, policy, tailBudget) {
  const normalized = normalizeScore(params, 'score')
  const cutoffResult = findTailCutoff(normalized, tailBudget)
  const calculationSourceMax = Math.max(display.max, policy.calculationMax)
  const displaySourceMax = calculationSourceMax - normalized.skill
  const workingMax = Math.max(
    cutoffResult.cutoff,
    displaySourceMax,
    0
  )
  const tailBound = scoreTailBound(workingMax, normalized)
  const oneDieCutoff = normalized.yousei > 0
    ? findTailCutoff(
        {
          dice: 1,
          critical: normalized.critical,
          shihai: 0,
          yousei: 0,
        },
        tailBudget / 2
      ).cutoff
    : 0
  // Keep every value through workingMax explicit. The final array entry is a
  // separate bucket for values strictly greater than workingMax.
  const workingLength = workingMax + 2
  const outputMax = Math.max(0, workingMax + normalized.skill)
  // ScoreCalculator convolves two complete working-length arrays. The FFT
  // therefore needs the exact linear-convolution length, including the
  // overflow bucket, rather than the old one-die-tail estimate.
  const youseiFftLength = normalized.yousei > 0 && normalized.critical <= 10
    ? nextPowerOfTwo(2 * workingLength - 1)
    : 0
  const operations = scoreOperationCount({
    params: normalized,
    workingLength,
  })
  const fftOperations = normalized.yousei * fftOperationCount(youseiFftLength)
  const arrayCount = normalized.shihai === 0
    ? 4
    : normalized.dice + 4
  const float64Bytes =
    arrayCount * workingLength * Float64Array.BYTES_PER_ELEMENT
  const tailModel = normalized.yousei > 0
    ? normalized.shihai === 0
      ? 'exact-yousei'
      : 'conservative-union-bound'
    : normalized.shihai === 0
      ? 'exact-max'
      : 'conservative-max-bound'

  /** @type {TailCertificate} */
  const tail = {
    model: tailModel,
    kind: 'dx-tail',
    finiteSupport: false,
    requested: tailBudget,
    cutoff: cutoffResult.cutoff,
    bound: tailBound,
    reachable: cutoffResult.reachable,
    modeledMax: workingMax,
    meaning: 'Probability of a score above the modeled cutoff before fixed skill shift',
  }

  return {
    params: normalized,
    display,
    support: {
      kind: 'dx-tail',
      finiteSupport: false,
      min: 0,
      max: workingMax,
      cutoff: cutoffResult.cutoff,
    },
    tail,
    workingMax,
    workingLength,
    outputMax,
    publishedOutputMax: policy.calculationMax + 1,
    oneDieCutoff,
    fftLength: youseiFftLength,
    operations,
    fftOperations,
    float64Bytes,
    finiteSupport: false,
  }
}

const BACKTRACK_DICE_MODIFIERS = {
  '戦闘用人格・生きる伝説': -1,
  生還者: 3,
  '戦友(通常)': 2,
  '戦友(強化)': 4,
}

function planBacktrack(params, display, policy) {
  object(params, 'backtrack')
  const normalized = {
    encroachment: integer(
      params.encroachment ?? 0,
      'backtrack.encroachment'
    ),
    lois: nonNegativeInteger(params.lois ?? 0, 'backtrack.lois'),
    elois: nonNegativeInteger(params.elois ?? 0, 'backtrack.elois'),
    dice: nonNegativeInteger(params.dice ?? 0, 'backtrack.dice'),
    value: nonNegativeInteger(params.value ?? 0, 'backtrack.value'),
    dlois: params.dlois ?? 'なし',
  }
  if (typeof normalized.dlois !== 'string') {
    throw new TypeError('backtrack.dlois must be a string')
  }
  const diceModifier = BACKTRACK_DICE_MODIFIERS[normalized.dlois] ?? 0
  const diceCounts = [1, 2, 3].map((multiplier) => Math.max(
    0,
    normalized.lois * multiplier +
      normalized.elois +
      normalized.dice +
      diceModifier
  ))
  const maxDice = Math.max(...diceCounts)
  const rawSupportMax = 10 * maxDice
  const workingLength = rawSupportMax + 1
  const assetOverflow = rawSupportMax > policy.calculationMax

  return {
    params: normalized,
    display,
    rule: normalized.dlois,
    diceModifier,
    diceCounts: {
      single: diceCounts[0],
      double: diceCounts[1],
      second: diceCounts[2],
    },
    maxDice,
    support: {
      kind: 'finite-support',
      finiteSupport: true,
      min: 0,
      max: rawSupportMax,
    },
    rawSupportMax,
    workingMax: rawSupportMax,
    workingLength,
    fftLength: 0,
    operations: workingLength * 3,
    float64Bytes: 3 * workingLength * Float64Array.BYTES_PER_ELEMENT,
    finiteSupport: true,
    assetOverflow,
    assetOverflowLowerBound: policy.calculationMax + 1,
  }
}

function normalizeAttack(params) {
  object(params, 'attack')
  return {
    dice: nonNegativeInteger(params.dice, 'attack.dice'),
    value: integer(params.value, 'attack.value'),
    kazanari: nonNegativeInteger(params.kazanari ?? 0, 'attack.kazanari'),
  }
}

function normalizeDefence(params) {
  object(params, 'defence')
  return {
    dice: nonNegativeInteger(params.dice, 'defence.dice'),
    value: integer(params.value, 'defence.value'),
  }
}

function planDamage(params, display, policy, maxScoreForDamage) {
  const attack = normalizeAttack(params.attack)
  const defence = normalizeDefence(params.defence)
  const maxDamageDice = Math.floor(maxScoreForDamage / 10) + 1 + attack.dice
  const rawMax = Math.max(0, 10 * maxDamageDice)
  const fixedDifference = attack.value - defence.value
  const defenceMax = 10 * defence.dice
  const workingMax = fixedDifference >= 0
    ? Math.max(
        0,
        Math.min(rawMax + fixedDifference, policy.calculationMax + defenceMax)
      )
    : Math.max(
        0,
        Math.min(
          rawMax,
          policy.calculationMax - fixedDifference + defenceMax
        )
      )
  const damageRollFftLength = nextPowerOfTwo(rawMax + 1)
  const workingLength = workingMax + 2
  const defenceFftLength = defence.dice > 0
    ? nextPowerOfTwo(workingLength + defenceMax)
    : 0
  const damageOperations =
    (damageRollFftLength / 2 + 1) *
      (maxDamageDice + 1) *
      Math.max(1, 1 + 6 * attack.kazanari)
  const fftOperations = fftOperationCount(defenceFftLength)
  const float64Bytes =
    (2 * damageRollFftLength + workingLength +
      (defence.dice > 0
        ? 2 * defenceFftLength + 2 * workingLength
        : 0)) *
    Float64Array.BYTES_PER_ELEMENT

  return {
    ...attack,
    attackDice: attack.dice,
    attackValue: attack.value,
    defenceDice: defence.dice,
    defenceValue: defence.value,
    fixedDifference,
    maxDamageDice,
    support: {
      kind: 'finite-support',
      finiteSupport: true,
      min: 0,
      max: rawMax,
    },
    rawSupportMax: rawMax,
    rawMax,
    workingMax,
    workingLength,
    defenceMax,
    fftLength: damageRollFftLength,
    defenceFftLength,
    operations: damageOperations,
    damageOperations,
    fftOperations,
    float64Bytes,
    finiteSupport: true,
    scoreValueMode: policy.scorePropagation,
    scoreValueUpperBound: maxScoreForDamage,
    calculationMax: policy.calculationMax,
    display,
  }
}

function planResources(scorePlans, damagePlan, comboCount, policy) {
  const scoreOperations = scorePlans.reduce(
    (sum, plan) => sum + plan.operations,
    0
  )
  const scoreFftOperations = scorePlans.reduce(
    (sum, plan) => sum + plan.fftOperations,
    0
  )
  const scoreBytes = scorePlans.reduce(
    (sum, plan) => sum + plan.float64Bytes,
    0
  )
  const comboFftOperations = comboCount > 1
    ? comboCount * fftOperationCount(
        nextPowerOfTwo(2 * (damagePlan.workingLength + 1))
      )
    : 0
  const damageFftOperations = damagePlan.fftOperations + comboFftOperations
  const operations = scoreOperations + scoreFftOperations +
    damagePlan.operations + damageFftOperations
  const dxTimeMs = scoreOperations / policy.costModel.dxOperationsPerMs
  const damageTimeMs =
    damagePlan.operations / policy.costModel.damageOperationsPerMs
  const fftTimeMs =
    (scoreFftOperations + damageFftOperations) /
    policy.costModel.fftOperationsPerMs

  return {
    operations,
    timeMs: dxTimeMs + damageTimeMs + fftTimeMs,
    dxTimeMs,
    damageTimeMs,
    fftTimeMs,
    float64Bytes: scoreBytes + damagePlan.float64Bytes,
    scoreOperations,
    scoreFftOperations,
    damageOperations: damagePlan.operations,
    damageFftOperations,
    totalDamageFftOperations: damageFftOperations,
  }
}

function scoreOnlyResources(scores, policy) {
  const scoreOperations = scores.reduce(
    (sum, score) => sum + score.operations,
    0
  )
  const scoreFftOperations = scores.reduce(
    (sum, score) => sum + score.fftOperations,
    0
  )
  const dxTimeMs = scoreOperations / policy.costModel.dxOperationsPerMs
  const fftTimeMs = scoreFftOperations / policy.costModel.fftOperationsPerMs
  return {
    operations: scoreOperations + scoreFftOperations,
    timeMs: dxTimeMs + fftTimeMs,
    dxTimeMs,
    damageTimeMs: 0,
    fftTimeMs,
    float64Bytes: scores.reduce(
      (sum, score) => sum + score.float64Bytes,
      0
    ),
    scoreOperations,
    scoreFftOperations,
    damageOperations: 0,
    damageFftOperations: 0,
  }
}

function backtrackResources(backtrack, policy) {
  const backtrackTimeMs =
    backtrack.operations / policy.costModel.backtrackOperationsPerMs
  return {
    operations: backtrack.operations,
    timeMs: backtrackTimeMs,
    dxTimeMs: 0,
    damageTimeMs: 0,
    fftTimeMs: 0,
    float64Bytes: backtrack.float64Bytes,
    scoreOperations: 0,
    scoreFftOperations: 0,
    damageOperations: 0,
    damageFftOperations: 0,
    backtrackOperations: backtrack.operations,
    backtrackTimeMs,
  }
}

function applyLimits(plan, policy) {
  const warnings = []
  let accepted = true
  const limits = policy.limits

  if (plan.display.points > policy.display.maxPoints) {
    addWarning(
      warnings,
      'display-points',
      'reject',
      'display point count exceeds the hard display limit',
      plan.display.points,
      policy.display.maxPoints
    )
    accepted = false
  }

  for (const score of plan.scores) {
    if (score.params.shihai > 0 && score.params.yousei > 0) {
      addWarning(
        warnings,
        'incompatible-input',
        'reject',
        'shihai and yousei cannot both be non-zero in the current compatibility mode',
        {
          shihai: score.params.shihai,
          yousei: score.params.yousei,
        },
        0
      )
      accepted = false
    }
    const scoreWorkingHardLimit = Math.min(
      limits.hard.workingLength,
      DX_MAX_DISTRIBUTION_SIZE
    )
    const scoreWorkingWarningLimit = Math.min(
      limits.warning.workingLength,
      scoreWorkingHardLimit
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'score-working-length',
      score.workingLength,
      scoreWorkingWarningLimit,
      scoreWorkingHardLimit,
      'elements'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'score-fft-length',
      score.fftLength,
      limits.warning.fftLength,
      limits.hard.fftLength,
      'elements'
    )
  }

  if (plan.backtrack) {
    accepted = classifyMetric(
      warnings,
      accepted,
      'backtrack-working-length',
      plan.backtrack.workingLength,
      limits.warning.workingLength,
      limits.hard.workingLength,
      'elements'
    )
    if (plan.backtrack.assetOverflow) {
      addWarning(
        warnings,
        'backtrack-asset-overflow',
        'warning',
        'the current finite distribution asset cannot represent the full backtrack support; generate a larger asset or use an on-demand calculator',
        plan.backtrack.rawSupportMax,
        plan.backtrack.assetOverflowLowerBound
      )
    }
  }

  if (plan.damage) {
    accepted = classifyMetric(
      warnings,
      accepted,
      'damage-working-length',
      plan.damage.workingLength,
      limits.warning.workingLength,
      limits.hard.workingLength,
      'elements'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'damage-fft-length',
      Math.max(plan.damage.fftLength, plan.damage.defenceFftLength),
      limits.warning.fftLength,
      limits.hard.fftLength,
      'elements'
    )
  }

  accepted = classifyMetric(
    warnings,
    accepted,
    'estimated-memory',
    plan.estimates.float64Bytes,
    limits.warning.estimatedMemoryBytes,
    limits.hard.estimatedMemoryBytes,
    'bytes'
  )
  accepted = classifyMetric(
    warnings,
    accepted,
    'estimated-time',
    plan.estimates.timeMs,
    limits.warning.estimatedTimeMs,
    limits.hard.estimatedTimeMs,
    'ms'
  )

  for (const score of plan.scores) {
    if (!score.tail.reachable) {
      addWarning(
        warnings,
        'tail-cutoff-unreachable',
        'reject',
        'the requested score tail error cannot be met within the search limit',
        score.tail.bound,
        score.tail.requested
      )
      accepted = false
    }
    if (score.tail.bound > score.tail.requested) {
      addWarning(
        warnings,
        'tail-error',
        'reject',
        'score tail bound exceeds the requested error budget',
        score.tail.bound,
        score.tail.requested
      )
      accepted = false
    }
  }

  return { accepted, warnings }
}

/**
 * @param {RangePlan} plan
 * @returns {OverflowSummary}
 */
function makeOverflowInfo(plan) {
  const score = plan.scores.length > 0
    ? {
        type: 'dx-tail',
        finiteSupport: false,
        lowerBound: plan.scores.length === 1
          ? plan.scores[0].workingMax + 1
          : null,
        bound: plan.scores.reduce(
          (sum, item) => sum + item.tail.bound,
          0
        ),
        meaning: 'DX values above each modeled range are represented by tail certificates; for multiple scores, bound is the sum and lowerBound is null because each score has its own boundary',
      }
    : null
  const damage = plan.damage
    ? {
        type: 'finite-support',
        finiteSupport: true,
        lowerBound: plan.damage.workingMax + 1,
        bound: 0,
        meaning: 'pre-defence damage values above workingMax use an explicit overflow bucket; raw DR support remains finite before fixed differences',
      }
    : null
  const display = {
    type: 'display-bucket',
    finiteSupport: false,
    lowerBound: plan.display.overflowLowerBound,
    bound: null,
    meaning: 'values at or above the display overflow boundary are grouped for presentation only',
  }
  const backtrack = plan.backtrack
    ? {
        type: plan.backtrack.assetOverflow ? 'asset' : 'finite-support',
        finiteSupport: true,
        lowerBound: plan.backtrack.assetOverflow
          ? plan.backtrack.assetOverflowLowerBound
          : null,
        bound: null,
        meaning: plan.backtrack.assetOverflow
          ? 'the existing finite backtrack asset cannot represent the full finite support'
          : 'backtrack D10 values have finite support within the selected asset',
      }
    : null

  return { score, damage, display, backtrack }
}

/**
 * Plan the ranges and resources required by a calculation.
 *
 * This function only returns a plan. It does not allocate calculator arrays,
 * invoke a calculator, alter UI limits, or select a production data path.
 *
 * @param {Object} params
 * @param {PlannerOperation} [params.operation='attack']
 * @param {ScoreInput | { action: ScoreInput, reaction: ScoreInput }} [params.score]
 * @param {AttackInput} [params.attack]
 * @param {DefenceInput} [params.defence]
 * @param {Object} [params.backtrack]
 * @param {DisplayInput} [params.display]
 * @param {number} [params.comboCount=1]
 * @param {RangePolicy} [policy]
 * @returns {RangePlan}
 */
export function planCalculationRanges(params, policy = {}) {
  const effectivePolicy = mergePolicy(policy)
  object(params, 'params')

  const operation = params.operation ?? 'attack'
  if (!['score', 'check', 'attack', 'backtrack'].includes(operation)) {
    throw new RangeError(
      'operation must be score, check, attack, or backtrack'
    )
  }
  const display = normalizeDisplay(params.display, effectivePolicy)
  const comboCount = params.comboCount ?? 1
  positiveInteger(comboCount, 'comboCount')

  let scores = []
  let damage = null
  let backtrack = null
  let tailBudget = 0

  if (operation === 'backtrack') {
    backtrack = planBacktrack(
      params.backtrack ?? params,
      display,
      effectivePolicy
    )
  } else {
    const scoreParams = operation === 'score'
      ? [params.score ?? params]
      : [
          params.score?.action ?? params.action,
          params.score?.reaction ?? params.reaction,
        ]

    if (scoreParams.some((value) => !value)) {
      throw new TypeError('score parameters are required')
    }
    tailBudget = effectivePolicy.errorBudget.scoreTail / scoreParams.length
    scores = scoreParams.map((score) =>
      planScore(score, display, effectivePolicy, tailBudget)
    )

    if (operation === 'attack') {
      damage = planDamage(
        params,
        display,
        effectivePolicy,
        effectivePolicy.scorePropagation === 'full-tail'
          ? scores[0].outputMax
          : effectivePolicy.calculationMax + 1
      )
    }
  }

  const estimates = backtrack
    ? backtrackResources(backtrack, effectivePolicy)
    : damage
      ? planResources(scores, damage, comboCount, effectivePolicy)
      : scoreOnlyResources(scores, effectivePolicy)

  /** @type {RangePlan} */
  const result = {
    accepted: true,
    operation,
    propagation: {
      score: effectivePolicy.scorePropagation,
      calculationMax: effectivePolicy.calculationMax,
    },
    display,
    scores,
    damage,
    backtrack,
    estimates,
    errorBudget: {
      total: effectivePolicy.errorBudget.total,
      scoreTail: operation === 'backtrack'
        ? 0
        : effectivePolicy.errorBudget.scoreTail,
      scorePerSide: tailBudget,
      finiteDamageTail: 0,
    },
    // Keep the reference planner's human-readable meanings for callers that
    // only need to display a short explanation. Structured details live in
    // overflowInfo so the kind and finite/infinite distinction are explicit.
    overflow: {
      score: 'values above the modeled cutoff are omitted only within tail error budget',
      damage: 'finite modeled values above display.max are an explicit display overflow bucket',
      totalDamage: 'once a value is aggregated above display.max, later operations must not subtract from it',
      backtrack: 'backtrack D10 distributions have finite support; values above the current asset boundary are asset overflow, not an infinite DX tail',
    },
    overflowInfo: null,
    warnings: [],
  }
  result.overflowInfo = makeOverflowInfo(result)

  const limitResult = applyLimits(result, effectivePolicy)
  result.accepted = limitResult.accepted
  result.warnings = limitResult.warnings
  if (!result.accepted) {
    result.rejectionReasons = Array.from(
      new Set(
        result.warnings
          .filter((warning) => warning.severity === 'reject')
          .map((warning) => warning.code)
      )
    )
  }
  return result
}
