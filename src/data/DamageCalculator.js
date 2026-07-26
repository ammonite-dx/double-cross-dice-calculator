import {
  getD10Distribution,
  getDrDistribution,
} from './PrecomputedDataRepository'
import {
  DISTRIBUTION_SIZE,
  getExpectedValue,
  getUpperTailProbability,
} from './Distribution'
import {
  subDistribution,
  sumDistribution,
} from './FFT'

function shiftDistribution(distribution, amount) {
  if (amount > 0) {
    const lowerFill = Array(amount).fill(0)
    const main = distribution.slice(0, DISTRIBUTION_SIZE - amount)
    const upperProtrusion = distribution
      .slice(DISTRIBUTION_SIZE - amount)
      .reduce((sum, probability) => sum + probability, 0)
    const shiftedDistribution = lowerFill.concat(main)
    shiftedDistribution[DISTRIBUTION_SIZE - 1] += upperProtrusion
    return shiftedDistribution
  }

  if (amount < 0) {
    const shift = -amount
    const lowerProtrusion = distribution
      .slice(0, shift)
      .reduce((sum, probability) => sum + probability, 0)
    const main = distribution.slice(shift)
    const upperFill = Array(shift).fill(0)
    const shiftedDistribution = main.concat(upperFill)
    shiftedDistribution[0] += lowerProtrusion
    return shiftedDistribution
  }

  return distribution
}

export function getDamage(score, attack, defence) {
  const scoreActionDistribution = score.action.distribution.slice()
  const scoreReactionUpperTailProbability =
    score.reaction.upperTailProbability.slice()
  const damageRollDistributions = scoreActionDistribution.map(
    (_, scoreValue) =>
      getDrDistribution(
        attack.kazanari,
        Math.floor(scoreValue / 10) + 1 + attack.dice
      )
  )

  let failureRate = 0
  for (let scoreValue = 0; scoreValue < DISTRIBUTION_SIZE; scoreValue += 1) {
    failureRate +=
      scoreActionDistribution[scoreValue] *
      scoreReactionUpperTailProbability[scoreValue]
  }

  let distribution = Array(DISTRIBUTION_SIZE).fill(0)
  for (let damage = 0; damage < DISTRIBUTION_SIZE; damage += 1) {
    let probability = 0
    for (let scoreValue = 0; scoreValue < DISTRIBUTION_SIZE; scoreValue += 1) {
      probability +=
        scoreActionDistribution[scoreValue] *
        (1 - scoreReactionUpperTailProbability[scoreValue]) *
        damageRollDistributions[scoreValue][damage]
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
      getD10Distribution(defence.dice)
    )
  }
  if (fixedValueDifference < 0) {
    distribution = shiftDistribution(distribution, fixedValueDifference)
  }

  distribution[0] += failureRate

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
  let distribution = Array(DISTRIBUTION_SIZE).fill(0)
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
