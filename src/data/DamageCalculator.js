import {
  getD10Distribution,
  getDrDamageDistributions,
} from './PrecomputedDataRepository'
import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  collapseDistribution,
  getExpectedValue,
  getUpperTailProbability,
  shiftDistribution,
} from './Distribution'
import {
  subDistribution,
  sumDistribution,
} from './FFT'

export function getDamage(score, attack, defence) {
  const scoreActionDistribution = score.action.distribution.slice()
  const scoreReactionUpperTailProbability =
    score.reaction.upperTailProbability.slice()
  const damageRollDistributions =
    getDrDamageDistributions(attack.kazanari)

  let failureRate = 0
  const damageDice = []
  const hitProbabilities = []
  for (
    let scoreValue = 0;
    scoreValue < OUTPUT_DISTRIBUTION_SIZE;
    scoreValue += 1
  ) {
    const actionProbability = scoreActionDistribution[scoreValue]
    failureRate +=
      actionProbability *
      scoreReactionUpperTailProbability[scoreValue]

    if (actionProbability !== 0) {
      damageDice.push(
        Math.floor(scoreValue / 10) + 1 + attack.dice
      )
      hitProbabilities.push(
        actionProbability *
          (1 - scoreReactionUpperTailProbability[scoreValue])
      )
    }
  }

  let distribution = Array(WORKING_DISTRIBUTION_SIZE).fill(0)
  for (
    let damage = 0;
    damage < WORKING_DISTRIBUTION_SIZE;
    damage += 1
  ) {
    let probability = 0
    const damageRollDistribution = damageRollDistributions[damage]

    for (let index = 0; index < damageDice.length; index += 1) {
      probability +=
        hitProbabilities[index] *
        damageRollDistribution[damageDice[index]]
    }
    distribution[damage] = probability
  }

  const fixedValueDifference = attack.value - defence.value
  if (fixedValueDifference > 0) {
    distribution = shiftDistribution(distribution, fixedValueDifference)
  }
  if (defence.dice > 0) {
    distribution = subDistribution(
      distribution,
      getD10Distribution(defence.dice, WORKING_DISTRIBUTION_SIZE)
    )
  }
  if (fixedValueDifference < 0) {
    distribution = shiftDistribution(distribution, fixedValueDifference)
  }

  distribution[0] += failureRate
  distribution = collapseDistribution(distribution)

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}

export function getDamageSummary(damage) {
  return {
    expectedValue: getExpectedValue(damage.distribution),
  }
}

export function getTotalDamage(combos) {
  let distribution = Array(OUTPUT_DISTRIBUTION_SIZE).fill(0)
  distribution[0] = 1

  for (const combo of combos) {
    if (combo.data.damage.distribution !== null) {
      distribution = sumDistribution(
        distribution,
        combo.data.damage.distribution
      )
    }
  }

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}
