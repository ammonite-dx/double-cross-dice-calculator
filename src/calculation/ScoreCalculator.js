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

export function calculateScore(
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
      distribution,
      upperTailProbability: getUpperTailProbability(distribution),
      failureProbability: 0,
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

  const shiftedDiceResult = shiftDistribution(diceResult, params.skill)
  shiftedDiceResult[0] += fumble
  if (plan) {
    validateProbabilityDistribution(shiftedDiceResult, 'skill-shifted score')
  }
  const distribution = collapseDistribution(shiftedDiceResult)

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
    failureProbability: fumble,
  }
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
