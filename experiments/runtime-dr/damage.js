import {
  getD10Distribution,
} from '../../src/data/PrecomputedDataRepository'
import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  collapseDistribution,
  getUpperTailProbability,
  shiftDistribution,
} from '../../src/data/Distribution'
import { subDistribution } from '../../src/data/FFT'

const DAMAGE_DICE_COUNT = 203

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
  getDefenceDiceDistribution = getD10Distribution
) {
  if (damageRollDistribution.length !== WORKING_DISTRIBUTION_SIZE) {
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
    distribution = subDistribution(
      distribution,
      getDefenceDiceDistribution(
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

export async function getDamageOnDemand(
  score,
  attack,
  defence,
  { client, signal, getDefenceDiceDistribution } = {}
) {
  if (!client || typeof client.calculate !== 'function') {
    throw new TypeError('client must provide a calculate function')
  }

  const request = createDamageRollRequest(score, attack)
  const damageRollDistribution = await client.calculate(
    request.weights,
    attack.kazanari,
    { signal }
  )

  return finalizeOnDemandDamage(
    damageRollDistribution,
    request.failureProbability,
    attack,
    defence,
    getDefenceDiceDistribution
  )
}
