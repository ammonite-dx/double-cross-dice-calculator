import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  collapseDistribution,
  getExpectedValue,
  getUpperTailProbability,
  shiftDistribution,
} from '../data/Distribution'
import {
  subDistribution,
  sumDistribution,
} from '../data/FFT'
import { MAX_DAMAGE_DICE } from './RuntimeDamageRollLimits'

const DAMAGE_DICE_COUNT = MAX_DAMAGE_DICE + 1

export function createDamageRollRequest(score, attack) {
  const weights = new Float64Array(DAMAGE_DICE_COUNT)
  let failureProbability = 0

  for (
    let scoreValue = 0;
    scoreValue < OUTPUT_DISTRIBUTION_SIZE;
    scoreValue += 1
  ) {
    const actionProbability = score.action.distribution[scoreValue]
    if (actionProbability === 0) {
      continue
    }

    const reactionSuccessProbability =
      score.reaction.upperTailProbability[scoreValue]
    failureProbability +=
      actionProbability * reactionSuccessProbability

    const hitProbability =
      actionProbability * (1 - reactionSuccessProbability)
    if (hitProbability === 0) {
      continue
    }

    const damageDice =
      Math.floor(scoreValue / 10) + 1 + attack.dice
    if (damageDice < 0 || damageDice >= DAMAGE_DICE_COUNT) {
      throw new RangeError(
        `damage dice are outside the supported range: ${damageDice}`
      )
    }
    weights[damageDice] += hitProbability
  }

  return { failureProbability, weights }
}

export function finalizeOnDemandDamage(
  damageRollDistribution,
  failureProbability,
  attack,
  defence,
  getD10Distribution
) {
  if (
    !damageRollDistribution ||
    damageRollDistribution.length !== WORKING_DISTRIBUTION_SIZE
  ) {
    throw new RangeError(
      `damage distribution must have ${WORKING_DISTRIBUTION_SIZE} entries`
    )
  }

  let distribution = Array.from(damageRollDistribution)
  const fixedValueDifference = attack.value - defence.value
  if (fixedValueDifference > 0) {
    distribution = shiftDistribution(distribution, fixedValueDifference)
  }
  if (defence.dice > 0) {
    if (typeof getD10Distribution !== 'function') {
      throw new TypeError('getD10Distribution must provide a function')
    }
    distribution = subDistribution(
      distribution,
      getD10Distribution(
        defence.dice,
        WORKING_DISTRIBUTION_SIZE
      )
    )
  }
  if (fixedValueDifference < 0) {
    distribution = shiftDistribution(distribution, fixedValueDifference)
  }

  distribution[0] += failureProbability
  distribution = collapseDistribution(distribution)

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}

export async function calculateDamageOnDemand(
  score,
  attack,
  defence,
  { getDamageRollDistribution, getD10Distribution } = {},
  options = {}
) {
  if (typeof getDamageRollDistribution !== 'function') {
    throw new TypeError(
      'getDamageRollDistribution must provide a function'
    )
  }

  const request = createDamageRollRequest(score, attack)
  const damageRollDistribution = await getDamageRollDistribution(
    request.weights,
    attack.kazanari,
    options
  )

  return finalizeOnDemandDamage(
    damageRollDistribution,
    request.failureProbability,
    attack,
    defence,
    getD10Distribution
  )
}

export function calculateDamage(
  score,
  attack,
  defence,
  { getD10Distribution, getDrDamageDistributions }
) {
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
