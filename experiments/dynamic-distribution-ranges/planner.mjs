const DEFAULT_ERROR_BUDGET = 1e-8

export const DEFAULT_POLICY = {
  // Keep the current public-score-to-damage contract unless a future change
  // explicitly opts into propagating the modeled DX tail.
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
  // These are deliberately explicit policy inputs. A production planner must
  // calibrate them with the supported browser/device matrix.
  costModel: {
    dxOperationsPerMs: 1_000_000,
    fftOperationsPerMs: 8_000_000,
    damageOperationsPerMs: 250_000,
    backtrackOperationsPerMs: 1_000_000,
  },
}

function integer(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`)
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

export function nextPowerOfTwo(value) {
  positiveInteger(value, 'value')
  let result = 1
  while (result < value) {
    result *= 2
  }
  return result
}

function mergePolicy(policy) {
  return {
    ...DEFAULT_POLICY,
    ...policy,
    errorBudget: {
      ...DEFAULT_POLICY.errorBudget,
      ...(policy?.errorBudget ?? {}),
    },
    display: {
      ...DEFAULT_POLICY.display,
      ...(policy?.display ?? {}),
    },
    limits: {
      warning: {
        ...DEFAULT_POLICY.limits.warning,
        ...(policy?.limits?.warning ?? {}),
      },
      hard: {
        ...DEFAULT_POLICY.limits.hard,
        ...(policy?.limits?.hard ?? {}),
      },
    },
    costModel: {
      ...DEFAULT_POLICY.costModel,
      ...(policy?.costModel ?? {}),
    },
  }
}

function geometricSum(probability, terms) {
  if (terms <= 0) {
    return 0
  }
  if (probability === 1) {
    return terms
  }
  return (1 - probability ** terms) / (1 - probability)
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
  const cumulative = oneDieCumulative(Math.floor(value), critical)
  return clampProbability(1 - cumulative ** dice)
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
// their y-term negative-binomial sum. Evaluate the survival probability
// directly instead of subtracting a near-one CDF from one.
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
    const term = pmf * maxGeometricTail(
      threshold - sum,
      dice,
      criticalProbability,
    )
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

  // A_y = 10(y + T) + R, with R uniform on 1..critical-1. At most two
  // distinct T thresholds occur among the possible remainders.
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

// `shihai > 0` is conservatively bounded by the maximum of all dice. The
// bound is intentionally looser than the order-statistic calculation, but it
// is independent of the finite work array and therefore suitable for a
// planner certificate.
export function scoreTailBound(value, params) {
  const { dice, critical, shihai = 0, yousei = 0 } = params
  nonNegativeInteger(dice, 'dice')
  nonNegativeInteger(shihai, 'shihai')
  nonNegativeInteger(yousei, 'yousei')
  if (!Number.isSafeInteger(critical) || critical < 2 || critical > 11) {
    throw new RangeError('score.critical must be between 2 and 11')
  }
  if (shihai < 0) {
    throw new RangeError('shihai must be non-negative')
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
  if (!(epsilon > 0 && epsilon < 1)) {
    throw new RangeError('epsilon must be between 0 and 1')
  }

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
  const min = display?.min ?? policy.display.defaultMin
  const max = display?.max ?? policy.display.defaultMax
  nonNegativeInteger(min, 'display.min')
  nonNegativeInteger(max, 'display.max')
  if (max < min) {
    throw new RangeError('display.max must be greater than or equal to display.min')
  }
  const points = max - min + 1
  return {
    min,
    max,
    points,
    overflowLowerBound: max + 1,
  }
}

function addWarning(warnings, code, severity, message, value, limit) {
  warnings.push({ code, severity, message, value, limit })
}

function classifyMetric(warnings, accepted, code, value, warningLimit, hardLimit, unit) {
  if (value > hardLimit) {
    addWarning(
      warnings,
      code,
      'reject',
      `${code} exceeds the hard limit`,
      value,
      hardLimit,
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
      warningLimit,
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

function planScore(params, display, policy, tailBudget) {
  const normalized = {
    dice: nonNegativeInteger(params.dice, 'score.dice'),
    critical: integer(params.critical, 'score.critical'),
    shihai: nonNegativeInteger(params.shihai ?? 0, 'score.shihai'),
    yousei: nonNegativeInteger(params.yousei ?? 0, 'score.yousei'),
    skill: integer(params.skill ?? 0, 'score.skill'),
  }
  if (normalized.critical < 2 || normalized.critical > 11) {
    throw new RangeError('score.critical must be between 2 and 11')
  }

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
    ? findTailCutoff({ dice: 1, critical: normalized.critical, shihai: 0, yousei: 0 }, tailBudget / 2).cutoff
    : 0
  const workingLength = workingMax + 1
  const outputMax = Math.max(0, workingMax + normalized.skill)
  const youseiFftLength = normalized.yousei > 0 && normalized.critical <= 10
    ? nextPowerOfTwo(workingLength + oneDieCutoff + 1)
    : 0
  const operations = scoreOperationCount({
    params: normalized,
    workingLength,
  })
  const fftOperations = normalized.yousei * fftOperationCount(youseiFftLength)
  const arrayCount = normalized.shihai === 0
    ? 4
    : normalized.dice + 4
  const float64Bytes = arrayCount * workingLength * Float64Array.BYTES_PER_ELEMENT
  const tailModel = normalized.yousei > 0
    ? normalized.shihai === 0
      ? 'exact-yousei'
      : 'conservative-union-bound'
    : normalized.shihai === 0
      ? 'exact-max'
      : 'conservative-max-bound'

  return {
    params: normalized,
    display,
    tail: {
      model: tailModel,
      requested: tailBudget,
      cutoff: cutoffResult.cutoff,
      bound: tailBound,
      reachable: cutoffResult.reachable,
      meaning: 'Probability of a score above cutoff before fixed skill shift',
    },
    workingMax,
    workingLength,
    outputMax,
    publishedOutputMax: policy.calculationMax + 1,
    oneDieCutoff,
    fftLength: youseiFftLength,
    operations,
    fftOperations,
    float64Bytes,
  }
}

const BACKTRACK_DICE_MODIFIERS = {
  '戦闘用人格・生きる伝説': -1,
  生還者: 3,
  '戦友(通常)': 2,
  '戦友(強化)': 4,
}

function planBacktrack(params, display, policy) {
  const normalized = {
    encroachment: integer(params.encroachment ?? 0, 'backtrack.encroachment'),
    lois: nonNegativeInteger(params.lois ?? 0, 'backtrack.lois'),
    elois: nonNegativeInteger(params.elois ?? 0, 'backtrack.elois'),
    dice: nonNegativeInteger(params.dice ?? 0, 'backtrack.dice'),
    value: nonNegativeInteger(params.value ?? 0, 'backtrack.value'),
    dlois: params.dlois ?? 'なし',
  }
  const diceModifier = BACKTRACK_DICE_MODIFIERS[normalized.dlois] ?? 0
  const diceCounts = [1, 2, 3].map((multiplier) => Math.max(
    0,
    normalized.lois * multiplier +
      normalized.elois +
      normalized.dice +
      diceModifier,
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
    rawSupportMax,
    workingMax: rawSupportMax,
    workingLength,
    operations: workingLength * 3,
    float64Bytes: 3 * workingLength * Float64Array.BYTES_PER_ELEMENT,
    finiteSupport: true,
    assetOverflow,
    assetOverflowLowerBound: policy.calculationMax + 1,
  }
}

function planDamage(
  params,
  actionScore,
  reactionScore,
  display,
  policy,
  maxScoreForDamage,
) {
  const attackDice = nonNegativeInteger(params.attack.dice, 'attack.dice')
  const attackValue = integer(params.attack.value, 'attack.value')
  const defenceDice = nonNegativeInteger(params.defence.dice, 'defence.dice')
  const defenceValue = integer(params.defence.value, 'defence.value')
  const kazanari = nonNegativeInteger(params.attack.kazanari ?? 0, 'attack.kazanari')
  const maxDamageDice = Math.floor(maxScoreForDamage / 10) + 1 + attackDice
  const rawMax = Math.max(0, 10 * maxDamageDice)
  const fixedDifference = attackValue - defenceValue
  const defenceMax = 10 * defenceDice
  const workingMax = fixedDifference >= 0
    ? Math.max(
        0,
        Math.min(rawMax + fixedDifference, policy.calculationMax + defenceMax),
      )
    : Math.max(
        0,
        Math.min(rawMax, policy.calculationMax - fixedDifference),
      )
  const damageRollFftLength = nextPowerOfTwo(rawMax + 1)
  const defenceFftLength = defenceDice > 0
    ? nextPowerOfTwo((workingMax + 1) + (defenceMax + 1) - 1)
    : 0
  const workingLength = workingMax + 1
  const damageOperations =
    (damageRollFftLength / 2 + 1) *
      (maxDamageDice + 1) *
      Math.max(1, 1 + 6 * kazanari)
  const fftOperations = fftOperationCount(defenceFftLength)
  const float64Bytes =
    (2 * damageRollFftLength + workingLength +
      (defenceDice > 0 ? 2 * defenceFftLength + 2 * workingLength : 0)) *
    Float64Array.BYTES_PER_ELEMENT

  return {
    attackDice,
    attackValue,
    defenceDice,
    defenceValue,
    kazanari,
    maxDamageDice,
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
  }
}

function planResources(scorePlans, damagePlan, comboCount, policy) {
  const scoreOperations = scorePlans.reduce((sum, plan) => sum + plan.operations, 0)
  const scoreFftOperations = scorePlans.reduce(
    (sum, plan) => sum + plan.fftOperations,
    0,
  )
  const scoreBytes = scorePlans.reduce((sum, plan) => sum + plan.float64Bytes, 0)
  const comboFftOperations = comboCount > 1
    ? comboCount * fftOperationCount(nextPowerOfTwo(2 * (damagePlan.workingLength + 1)))
    : 0
  const damageFftOperations = damagePlan.fftOperations + comboFftOperations
  const operations = scoreOperations + scoreFftOperations +
    damagePlan.operations + damageFftOperations
  const timeMs =
    scoreOperations / policy.costModel.dxOperationsPerMs +
    scoreFftOperations / policy.costModel.fftOperationsPerMs +
    damagePlan.operations / policy.costModel.damageOperationsPerMs +
    damageFftOperations / policy.costModel.fftOperationsPerMs
  return {
    operations,
    timeMs,
    float64Bytes: scoreBytes + damagePlan.float64Bytes,
    scoreOperations,
    scoreFftOperations,
    damageOperations: damagePlan.operations,
    damageFftOperations,
    totalDamageFftOperations: damageFftOperations,
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
      policy.display.maxPoints,
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
        0,
      )
      accepted = false
    }
    accepted = classifyMetric(
      warnings,
      accepted,
      'score-working-length',
      score.workingLength,
      limits.warning.workingLength,
      limits.hard.workingLength,
      'elements',
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'score-fft-length',
      score.fftLength,
      limits.warning.fftLength,
      limits.hard.fftLength,
      'elements',
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
      'elements',
    )
    if (plan.backtrack.assetOverflow) {
      addWarning(
        warnings,
        'backtrack-asset-overflow',
        'warning',
        'the current finite distribution asset cannot represent the full backtrack support; generate a larger asset or use an on-demand calculator',
        plan.backtrack.rawSupportMax,
        plan.backtrack.assetOverflowLowerBound,
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
      'elements',
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'damage-fft-length',
      Math.max(plan.damage.fftLength, plan.damage.defenceFftLength),
      limits.warning.fftLength,
      limits.hard.fftLength,
      'elements',
    )
  }
  accepted = classifyMetric(
    warnings,
    accepted,
    'estimated-memory',
    plan.estimates.float64Bytes,
    limits.warning.estimatedMemoryBytes,
    limits.hard.estimatedMemoryBytes,
    'bytes',
  )
  accepted = classifyMetric(
    warnings,
    accepted,
    'estimated-time',
    plan.estimates.timeMs,
    limits.warning.estimatedTimeMs,
    limits.hard.estimatedTimeMs,
    'ms',
  )

  for (const score of plan.scores) {
    if (!score.tail.reachable) {
      addWarning(
        warnings,
        'tail-cutoff-unreachable',
        'reject',
        'the requested score tail error cannot be met within the search limit',
        score.tail.bound,
        score.tail.requested,
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
        score.tail.requested,
      )
      accepted = false
    }
  }

  return { accepted, warnings }
}

export function planCalculationRanges(params, policy = {}) {
  const effectivePolicy = mergePolicy(policy)
  if (!params || typeof params !== 'object') {
    throw new TypeError('params must be an object')
  }

  const operation = params.operation ?? 'attack'
  if (!['score', 'attack', 'backtrack'].includes(operation)) {
    throw new RangeError('operation must be score, attack, or backtrack')
  }
  const display = normalizeDisplay(params.display, effectivePolicy)
  let scores = []
  let damage = null
  let backtrack = null
  let tailBudget = 0
  if (operation === 'backtrack') {
    backtrack = planBacktrack(params.backtrack ?? params, display, effectivePolicy)
  } else {
    const scoreParams = operation === 'score'
      ? [params.score ?? params]
      : [params.score?.action, params.score?.reaction]

    if (scoreParams.some((value) => !value)) {
      throw new TypeError('score parameters are required')
    }
    tailBudget = effectivePolicy.errorBudget.scoreTail /
      scoreParams.length
    scores = scoreParams.map((score) =>
      planScore(score, display, effectivePolicy, tailBudget)
    )

    damage = operation === 'score'
      ? null
      : planDamage(
          params,
          scores[0],
          scores[1],
          display,
          effectivePolicy,
          effectivePolicy.scorePropagation === 'full-tail'
            ? scores[0].outputMax
            : effectivePolicy.calculationMax + 1,
        )
  }
  const estimates = backtrack
    ? {
        operations: backtrack.operations,
        timeMs: backtrack.operations / effectivePolicy.costModel.backtrackOperationsPerMs,
        float64Bytes: backtrack.float64Bytes,
        scoreOperations: 0,
        scoreFftOperations: 0,
        damageOperations: 0,
        damageFftOperations: 0,
      }
    : damage
      ? planResources(scores, damage, params.comboCount ?? 1, effectivePolicy)
      : {
          operations: scores.reduce((sum, score) => sum + score.operations + score.fftOperations, 0),
          timeMs: scores.reduce((sum, score) => sum + score.operations, 0) /
              effectivePolicy.costModel.dxOperationsPerMs +
            scores.reduce((sum, score) => sum + score.fftOperations, 0) /
              effectivePolicy.costModel.fftOperationsPerMs,
          float64Bytes: scores.reduce((sum, score) => sum + score.float64Bytes, 0),
          scoreOperations: scores.reduce((sum, score) => sum + score.operations, 0),
          scoreFftOperations: scores.reduce((sum, score) => sum + score.fftOperations, 0),
          damageOperations: 0,
          damageFftOperations: 0,
        }
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
      scoreTail: operation === 'backtrack' ? 0 : effectivePolicy.errorBudget.scoreTail,
      scorePerSide: tailBudget,
      finiteDamageTail: 0,
    },
    overflow: {
      score: 'values above the modeled cutoff are omitted only within tail error budget',
      damage: 'finite modeled values above display.max are an explicit display overflow bucket',
      totalDamage: 'once a value is aggregated above display.max, later operations must not subtract from it',
      backtrack: 'backtrack D10 distributions have finite support; values above the current asset boundary are asset overflow, not an infinite DX tail',
    },
  }
  const limitResult = applyLimits(result, effectivePolicy)
  result.accepted = limitResult.accepted
  result.warnings = limitResult.warnings
  if (!result.accepted) {
    result.rejectionReasons = result.warnings
      .filter((warning) => warning.severity === 'reject')
      .map((warning) => warning.code)
  }
  return result
}
