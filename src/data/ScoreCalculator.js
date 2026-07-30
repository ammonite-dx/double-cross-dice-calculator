import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  collapseDistribution,
  expandSparseDistribution,
  getExpectedValue,
  getUpperTailProbability,
  shiftDistribution,
} from './Distribution'
import { sumDistribution } from './FFT'
import { getDxDistribution } from './PrecomputedDataRepository'

export function calculateScore(
  params,
  getDistribution = getDxDistribution,
  fix = false
) {
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
    }
  }

  let diceResult = expandSparseDistribution(
    getDistribution(params.shihai, params.dice, params.critical),
    WORKING_DISTRIBUTION_SIZE
  )

  if (params.yousei > 0) {
    const youseiResult = expandSparseDistribution(
      getDistribution(0, 1, params.critical),
      WORKING_DISTRIBUTION_SIZE
    )

    for (let count = 0; count < params.yousei; count += 1) {
      diceResult = Array.from(
        { length: WORKING_DISTRIBUTION_SIZE },
        (_, value) =>
          value % 10 === 0
            ? diceResult
              .slice(Math.max(0, value - 9), value + 1)
              .reduce((sum, probability) => sum + probability, 0)
            : 0
      )
      diceResult[WORKING_DISTRIBUTION_SIZE - 1] =
        1 -
        diceResult
          .slice(0, WORKING_DISTRIBUTION_SIZE - 1)
          .reduce((sum, probability) => sum + probability, 0)

      if (params.critical <= 10) {
        diceResult = sumDistribution(diceResult, youseiResult)
      }
    }
  }

  const fumble = diceResult[0] + diceResult[1]
  diceResult[0] = 0
  diceResult[1] = 0

  const shiftedDiceResult = shiftDistribution(diceResult, params.skill)
  shiftedDiceResult[0] += fumble
  const distribution = collapseDistribution(shiftedDiceResult)

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}

export function getScore(params, fix = false) {
  return calculateScore(params, getDxDistribution, fix)
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
    actionSuccessRate =
      Math.round(score.action.upperTailProbability[dfclty.target] * 1000) / 10
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
