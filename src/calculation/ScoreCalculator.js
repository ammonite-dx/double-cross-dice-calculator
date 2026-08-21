import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  collapseDistribution,
  expandSparseDistribution,
  getExpectedValue,
  getUpperTailProbability,
  shiftDistribution,
} from '../data/Distribution'
import { sumDistribution } from '../data/FFT'
import {
  DISTRIBUTION_RESULT_TOLERANCE,
  createDistributionResult,
  getExpectedValueSummary,
  validateDistributionResult,
} from './DistributionResult'

function validateScoreRangePlan(scoreRangePlan) {
  if (scoreRangePlan === undefined || scoreRangePlan === null) {
    return null
  }
  if (
    typeof scoreRangePlan !== 'object' ||
    !Number.isSafeInteger(scoreRangePlan.workingLength) ||
    scoreRangePlan.workingLength < 2
  ) {
    throw new TypeError('scoreRangePlan.workingLength must be at least 2')
  }
  if (
    scoreRangePlan.fftLength !== undefined &&
    (!Number.isSafeInteger(scoreRangePlan.fftLength) ||
      scoreRangePlan.fftLength < 0)
  ) {
    throw new TypeError('scoreRangePlan.fftLength must be a non-negative safe integer')
  }
  return scoreRangePlan
}

function expandDxDistribution(
  distribution,
  fallbackLength,
  expectedLength,
  label
) {
  if (distribution instanceof Float64Array) {
    if (expectedLength !== undefined && distribution.length !== expectedLength) {
      throw new RangeError(
        `${label} length must equal scoreRangePlan.workingLength`
      )
    }
    return Array.from(distribution)
  }

  const expanded = expandSparseDistribution(
    distribution,
    fallbackLength
  )
  if (expectedLength !== undefined && expanded.length !== expectedLength) {
    throw new RangeError(
      `${label} length must equal scoreRangePlan.workingLength`
    )
  }
  return expanded
}

function validateProbabilityDistribution(distribution, label) {
  let total = 0
  for (const probability of distribution) {
    if (!Number.isFinite(probability) || Number.isNaN(probability)) {
      throw new RangeError(`${label} contains NaN or infinity`)
    }
    if (probability < -1e-12) {
      throw new RangeError(`${label} contains a negative probability`)
    }
    total += probability
  }
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-8) {
    throw new RangeError(`${label} probability total is not approximately one`)
  }
}

function calculateScoreWorking(
  params,
  { getDxDistribution },
  fix = false,
  scoreRangePlan
) {
  const plan = validateScoreRangePlan(scoreRangePlan)

  if (fix) {
    const distribution = Array(OUTPUT_DISTRIBUTION_SIZE).fill(0)
    const fixedScore = Math.min(
      OUTPUT_DISTRIBUTION_SIZE - 1,
      Math.max(0, params.skill)
    )
    distribution[fixedScore] = 1
    return {
      workingDistribution: distribution,
      failureProbability: 0,
      alreadyShifted: true,
      plan,
    }
  }

  const requestedLength = plan?.workingLength ?? WORKING_DISTRIBUTION_SIZE
  const dxOptions = plan
    ? { workingLength: requestedLength, rounding: 'unrounded' }
    : undefined
  const getDistribution = (shihai, dice, critical) =>
    dxOptions === undefined
      ? getDxDistribution(shihai, dice, critical)
      : getDxDistribution(shihai, dice, critical, dxOptions)
  let diceResult = expandDxDistribution(
    getDistribution(params.shihai, params.dice, params.critical),
    requestedLength,
    plan?.workingLength,
    'DX distribution'
  )
  if (plan) {
    validateProbabilityDistribution(diceResult, 'DX distribution')
  }

  if (params.dice > 0 && params.yousei > 0) {
    const youseiResult = expandDxDistribution(
      getDistribution(0, 1, params.critical),
      diceResult.length,
      plan?.workingLength,
      'yousei distribution'
    )

    if (youseiResult.length !== diceResult.length) {
      throw new RangeError(
        'DX and yousei distributions must have the same working length'
      )
    }
    if (plan) {
      validateProbabilityDistribution(youseiResult, 'yousei distribution')
    }

    for (let count = 0; count < params.yousei; count += 1) {
      const workingLength = diceResult.length
      diceResult = Array.from(
        { length: workingLength },
        (_, value) =>
          value % 10 === 0
            ? diceResult
              .slice(Math.max(0, value - 9), value + 1)
              .reduce((sum, probability) => sum + probability, 0)
            : 0
      )
      diceResult[workingLength - 1] =
        1 -
        diceResult
          .slice(0, workingLength - 1)
          .reduce((sum, probability) => sum + probability, 0)
      if (plan) {
        validateProbabilityDistribution(diceResult, 'yousei rounding')
      }

      if (params.critical <= 10) {
        diceResult = sumDistribution(
          diceResult,
          youseiResult,
          plan ? { fftLength: plan.fftLength } : undefined
        )
        if (plan) {
          validateProbabilityDistribution(diceResult, 'Score convolution')
        }
      }
    }
  }

  const fumble = (diceResult[0] ?? 0) + (diceResult[1] ?? 0)
  if (diceResult.length > 0) {
    diceResult[0] = 0
  }
  if (diceResult.length > 1) {
    diceResult[1] = 0
  }

  return {
    workingDistribution: diceResult,
    failureProbability: fumble,
    alreadyShifted: false,
    plan,
  }
}

export function calculateScore(
  params,
  dependencies,
  fix = false,
  scoreRangePlan
) {
  const {
    workingDistribution,
    failureProbability,
    alreadyShifted,
  } = calculateScoreWorking(params, dependencies, fix, scoreRangePlan)
  const shiftedDistribution = alreadyShifted
    ? workingDistribution
    : shiftDistribution(workingDistribution, params.skill)
  if (!alreadyShifted) {
    shiftedDistribution[0] += failureProbability
    if (scoreRangePlan) {
      validateProbabilityDistribution(shiftedDistribution, 'skill-shifted score')
    }
  }
  const distribution = collapseDistribution(shiftedDistribution)

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
    failureProbability,
  }
}

function getFiniteRawSupportMax(params) {
  if (params.dice === 0 || params.dice <= (params.shihai ?? 0)) {
    return 0
  }
  if (params.critical === 11) {
    return 10
  }
  return null
}

function getCanonicalSupport(params, alreadyShifted = false) {
  if (alreadyShifted) {
    return {
      kind: 'finite',
      max: Math.min(
        OUTPUT_DISTRIBUTION_SIZE - 1,
        Math.max(0, params.skill)
      ),
    }
  }
  const finiteRawSupportMax = getFiniteRawSupportMax(params)
  if (finiteRawSupportMax === null) {
    return { kind: 'infinite' }
  }
  if (finiteRawSupportMax === 0) {
    return { kind: 'finite', max: 0 }
  }
  return {
    kind: 'finite',
    max: Math.max(0, finiteRawSupportMax + params.skill),
  }
}

function createCanonicalScoreResult(
  params,
  workingDistribution,
  failureProbability,
  scoreRangePlan,
  alreadyShifted = false
) {
  const workingMax = scoreRangePlan?.workingLength !== undefined
    ? scoreRangePlan.workingLength - 2
    : workingDistribution.length - 2
  const overflowIndex = workingDistribution.length - 1
  const support = getCanonicalSupport(params, alreadyShifted)
  const finiteSupport = support.kind === 'finite'
  const explicitMax = finiteSupport
    ? support.max
    : Math.max(0, workingMax + params.skill)
  const values = new Float64Array(explicitMax + 1)

  for (let rawValue = 0; rawValue < overflowIndex; rawValue += 1) {
    const probability = workingDistribution[rawValue]
    if (probability === 0) {
      continue
    }
    const scoreValue = alreadyShifted
      ? rawValue
      : Math.max(0, rawValue + params.skill)
    if (scoreValue <= explicitMax) {
      values[scoreValue] += probability
    }
  }

  values[0] += failureProbability

  const tailProbability = workingDistribution[overflowIndex] ?? 0
  if (
    finiteSupport
    && Math.abs(tailProbability) > DISTRIBUTION_RESULT_TOLERANCE
  ) {
    throw new RangeError(
      'finite canonical score support contains non-zero working tail'
    )
  }

  const overflowProbability = finiteSupport
    ? 0
    : tailProbability
  const overflow = finiteSupport
    ? null
    : {
        kind: 'exact',
        lowerBound: Math.max(0, workingMax + 1 + params.skill),
        probability: overflowProbability,
        errorBound: DISTRIBUTION_RESULT_TOLERANCE,
      }

  return createDistributionResult({
    values,
    offset: 0,
    support,
    overflow,
  })
}

export function calculateScoreCanonical(
  params,
  dependencies,
  scoreRangePlan,
  fix = false
) {
  const {
    workingDistribution,
    failureProbability,
    alreadyShifted,
  } = calculateScoreWorking(
    params,
    dependencies,
    fix,
    scoreRangePlan
  )
  const result = createCanonicalScoreResult(
    params,
    workingDistribution,
    failureProbability,
    scoreRangePlan,
    alreadyShifted
  )
  const metadata = Object.freeze({
    modeledDistribution: true,
    failureProbability,
  })

  return Object.freeze({ result, metadata })
}

function createCanonicalScoreRateSummary(kind, details = {}) {
  return Object.freeze({ kind, ...details })
}

function getExactCanonicalScoreBuckets(envelope) {
  if (
    envelope === null
    || typeof envelope !== 'object'
    || envelope.result === null
    || typeof envelope.result !== 'object'
  ) {
    return null
  }

  validateDistributionResult(envelope.result)
  const result = envelope.result
  const buckets = []
  for (let index = 0; index < result.values.length; index += 1) {
    const probability = result.values[index]
    if (probability !== 0) {
      buckets.push({
        value: result.offset + index,
        probability,
      })
    }
  }

  const overflow = result.overflow
  if (overflow === null) {
    return buckets
  }
  if (overflow.kind === 'upper-bound') {
    return overflow.probabilityUpperBound === 0
      ? buckets
      : null
  }
  if (overflow.probability === 0) {
    return buckets
  }
  if (
    result.support.kind === 'finite'
    && overflow.lowerBound === result.support.max
  ) {
    buckets.push({
      value: result.support.max,
      probability: overflow.probability,
    })
    return buckets
  }
  return null
}

/**
 * Calculate P(action > reaction) for ascending, sparse score buckets.
 * `onReactionVisit` is intentionally optional and exists for structural tests
 * of the linear two-pointer walk; production callers do not allocate stats.
 */
export function calculateCanonicalScoreSuccessProbability(
  actionBuckets,
  reactionBuckets,
  onReactionVisit
) {
  let reactionIndex = 0
  let reactionBelow = 0
  let actionSuccessProbability = 0

  for (const actionBucket of actionBuckets) {
    while (
      reactionIndex < reactionBuckets.length
      && reactionBuckets[reactionIndex].value < actionBucket.value
    ) {
      const reactionBucket = reactionBuckets[reactionIndex]
      reactionBelow += reactionBucket.probability
      onReactionVisit?.(reactionBucket, reactionIndex)
      reactionIndex += 1
    }
    actionSuccessProbability +=
      actionBucket.probability * reactionBelow
  }

  return actionSuccessProbability
}

function getCanonicalScoreSuccessRateSummary(action, reaction) {
  const actionBuckets = getExactCanonicalScoreBuckets(action)
  const reactionBuckets = getExactCanonicalScoreBuckets(reaction)
  if (actionBuckets === null || reactionBuckets === null) {
    return {
      action: createCanonicalScoreRateSummary('bounded', {
        lowerBound: 0,
        upperBound: 100,
      }),
      reaction: createCanonicalScoreRateSummary('bounded', {
        lowerBound: 0,
        upperBound: 100,
      }),
    }
  }

  const actionSuccessRate = calculateCanonicalScoreSuccessProbability(
    actionBuckets,
    reactionBuckets
  )

  const roundedActionSuccessRate = Math.round(actionSuccessRate * 1000) / 10
  return {
    action: createCanonicalScoreRateSummary('exact', {
      value: roundedActionSuccessRate,
    }),
    reaction: createCanonicalScoreRateSummary('exact', {
      value: Math.round((100 - roundedActionSuccessRate) * 10) / 10,
    }),
  }
}

/**
 * Summarize the two canonical Attack score envelopes without projecting them
 * into the legacy 1024 buckets. Expected values retain the canonical
 * exact/bounded/lower-bound semantics; success rates are point values only
 * when both score supports are fully represented.
 */
export function getCanonicalScoreSummary(
  score,
  dfclty = { opposed: true, target: 0 }
) {
  if (
    score === null
    || typeof score !== 'object'
    || score.action === null
    || typeof score.action !== 'object'
    || score.reaction === null
    || typeof score.reaction !== 'object'
  ) {
    throw new TypeError('canonical score must contain action and reaction envelopes')
  }

  const actionExpectedValue = getExpectedValueSummary(score.action.result)
  const reactionExpectedValue = getExpectedValueSummary(score.reaction.result)
  let rates
  if (dfclty.opposed) {
    rates = getCanonicalScoreSuccessRateSummary(
      score.action,
      score.reaction
    )
  } else {
    const actionBuckets = getExactCanonicalScoreBuckets(score.action)
    if (actionBuckets === null) {
      rates = {
        action: createCanonicalScoreRateSummary('bounded', {
          lowerBound: 0,
          upperBound: 100,
        }),
        reaction: createCanonicalScoreRateSummary('exact', { value: 0 }),
      }
    } else {
      const target = dfclty.target ?? 0
      const successProbability = actionBuckets
        .filter(({ value }) => value >= target)
        .reduce((sum, bucket) => sum + bucket.probability, 0)
        - (target === 0
          ? (score.action.metadata?.failureProbability ?? 0)
          : 0)
      const value = Math.round(successProbability * 1000) / 10
      rates = {
        action: createCanonicalScoreRateSummary('exact', { value }),
        reaction: createCanonicalScoreRateSummary('exact', { value: 0 }),
      }
    }
  }

  return Object.freeze({
    action: Object.freeze({
      expectedValue: actionExpectedValue,
      successRate: rates.action,
    }),
    reaction: Object.freeze({
      expectedValue: reactionExpectedValue,
      successRate: rates.reaction,
    }),
  })
}

export function getScoreSummary(
  score,
  dfclty = { opposed: true, target: 0 }
) {
  let actionExpectedValue
  let actionSuccessRate
  let reactionExpectedValue
  let reactionSuccessRate

  if (
    dfclty.opposed &&
    score.action.distribution &&
    score.action.upperTailProbability &&
    score.reaction.distribution &&
    score.reaction.upperTailProbability
  ) {
    actionExpectedValue = getExpectedValue(score.action.distribution)
    actionSuccessRate = 0
    for (
      let value = 0;
      value < OUTPUT_DISTRIBUTION_SIZE;
      value += 1
    ) {
      actionSuccessRate +=
        score.action.distribution[value] *
        (1 - score.reaction.upperTailProbability[value])
    }
    actionSuccessRate = Math.round(actionSuccessRate * 1000) / 10
    reactionExpectedValue = getExpectedValue(score.reaction.distribution)
    reactionSuccessRate = Math.round((100 - actionSuccessRate) * 10) / 10
  } else if (
    !dfclty.opposed &&
    score.action.distribution &&
    score.action.upperTailProbability
  ) {
    actionExpectedValue = getExpectedValue(score.action.distribution)
    const successProbability =
      score.action.upperTailProbability[dfclty.target] -
      (dfclty.target === 0
        ? (score.action.failureProbability ?? 0)
        : 0)
    actionSuccessRate = Math.round(successProbability * 1000) / 10
    reactionExpectedValue = 0
    reactionSuccessRate = 0
  }

  return {
    action: {
      expectedValue: actionExpectedValue,
      successRate: actionSuccessRate,
    },
    reaction: {
      expectedValue: reactionExpectedValue,
      successRate: reactionSuccessRate,
    },
  }
}
