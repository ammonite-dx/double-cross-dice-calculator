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
import {
  MAX_DAMAGE_DICE,
  RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE,
  RUNTIME_DAMAGE_MIN_FFT_SIZE,
} from './RuntimeDamageRollLimits'
import { createDistributionResult } from './DistributionResult'

const DAMAGE_DICE_COUNT = MAX_DAMAGE_DICE + 1
const PROBABILITY_TOLERANCE = 1e-10
const TOTAL_TOLERANCE = 1e-8

function isProbabilityArray(value) {
  return Array.isArray(value) || value instanceof Float64Array
}

function validateDamageRangePlan(plan, attack, defence) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new TypeError('damageRangePlan must be an object')
  }

  const requiredFields = [
    'rawSupportMax',
    'workingMax',
    'workingLength',
    'defenceMax',
    'fftLength',
    'defenceFftLength',
  ]
  for (const field of requiredFields) {
    if (!Number.isSafeInteger(plan[field])) {
      throw new TypeError(`damageRangePlan.${field} must be a safe integer`)
    }
  }

  if (plan.rawSupportMax < 0) {
    throw new RangeError('damageRangePlan.rawSupportMax must be non-negative')
  }
  if (plan.workingMax < 0 || plan.workingLength < 2) {
    throw new RangeError(
      'damageRangePlan.workingMax and workingLength must describe a valid range'
    )
  }
  if (plan.workingLength !== plan.workingMax + 2) {
    throw new RangeError(
      'damageRangePlan.workingLength must equal workingMax + 2'
    )
  }
  if (plan.defenceMax !== defence.dice * 10) {
    throw new RangeError(
      'damageRangePlan.defenceMax does not match the supplied defence'
    )
  }
  if (
    plan.fixedDifference !== undefined &&
    plan.fixedDifference !== attack.value - defence.value
  ) {
    throw new RangeError(
      'damageRangePlan.fixedDifference does not match the supplied attack and defence'
    )
  }
  if (plan.fftLength < 0 || plan.defenceFftLength < 0) {
    throw new RangeError('damageRangePlan FFT lengths must be non-negative')
  }

  return plan
}

function getPlannedRawDistributionLength(plan, fixedValueDifference) {
  const requiredRawMax = fixedValueDifference >= 0
    ? Math.max(0, plan.workingMax - fixedValueDifference)
    : plan.workingMax
  if (requiredRawMax > plan.rawSupportMax) {
    throw new RangeError(
      'damageRangePlan does not retain enough raw damage support'
    )
  }

  const distributionLength = requiredRawMax < plan.rawSupportMax
    ? requiredRawMax + 2
    : plan.rawSupportMax + 1
  return Math.max(
    RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE,
    distributionLength
  )
}

function validateDamageRollDistribution(
  distribution,
  expectedLength,
  expectedTotal
) {
  if (!isProbabilityArray(distribution) || distribution.length !== expectedLength) {
    throw new RangeError(
      `damage distribution must have ${expectedLength} entries`
    )
  }

  const normalized = new Float64Array(expectedLength)
  let total = 0
  for (let index = 0; index < distribution.length; index += 1) {
    const probability = distribution[index]
    if (!Number.isFinite(probability)) {
      throw new RangeError('damage distribution contains a non-finite probability')
    }
    if (probability < -PROBABILITY_TOLERANCE) {
      throw new RangeError('damage distribution contains a negative probability')
    }
    const nonNegative = probability < 0 ? 0 : probability
    normalized[index] = nonNegative
    total += nonNegative
  }

  if (expectedTotal !== undefined) {
    const allowedError = Number.isFinite(expectedTotal)
      ? TOTAL_TOLERANCE * Math.max(1, expectedTotal)
      : NaN
    if (
      !Number.isFinite(expectedTotal) ||
      expectedTotal < 0 ||
      !Number.isFinite(total) ||
      Math.abs(total - expectedTotal) > allowedError
    ) {
      throw new RangeError(
        'damage distribution probability total does not match the hit probability'
      )
    }
  }
  return normalized
}

function getFiniteDefenceDistribution(
  getD10Distribution,
  defence,
  damageRangePlan
) {
  if (typeof getD10Distribution !== 'function') {
    throw new TypeError('getD10Distribution must provide a function')
  }

  const expectedLength = damageRangePlan.defenceMax + 1
  const source = getD10Distribution(defence.dice, expectedLength)
  if (!isProbabilityArray(source) || source.length !== expectedLength) {
    throw new RangeError(
      `defence distribution must have ${expectedLength} entries`
    )
  }

  const result = Array(expectedLength).fill(0)
  let total = 0
  for (let index = 0; index < expectedLength; index += 1) {
    const probability = source[index]
    if (!Number.isFinite(probability)) {
      throw new RangeError('defence distribution contains a non-finite probability')
    }
    if (probability < -PROBABILITY_TOLERANCE) {
      throw new RangeError('defence distribution contains a negative probability')
    }
    result[index] = probability < 0 ? 0 : probability
    total += result[index]
  }
  if (Math.abs(total - 1) > TOTAL_TOLERANCE) {
    throw new RangeError(
      'defence distribution probability total must be approximately one'
    )
  }
  return result
}

function composePlannedDamage(
  damageRollDistribution,
  failureProbability,
  attack,
  defence,
  getD10Distribution,
  damageRangePlan,
  onFftLength
) {
  const fixedValueDifference = attack.value - defence.value
  const plan = validateDamageRangePlan(
    damageRangePlan,
    attack,
    defence
  )
  const rawDistributionLength = getPlannedRawDistributionLength(
    plan,
    fixedValueDifference
  )
  const normalizedDamageRollDistribution = validateDamageRollDistribution(
    damageRollDistribution,
    rawDistributionLength
  )
  const rawSupportEndIsExplicit =
    fixedValueDifference >= 0
      ? Math.max(0, plan.workingMax - fixedValueDifference) ===
        plan.rawSupportMax &&
        rawDistributionLength === plan.rawSupportMax + 1
      : plan.workingMax === plan.rawSupportMax &&
        rawDistributionLength === plan.rawSupportMax + 1

  const workingLength = plan.workingLength
  let distribution = Array(workingLength).fill(0)
  let overflowProbability = 0
  const lastIndex = normalizedDamageRollDistribution.length - 1
  const explicitEnd = rawSupportEndIsExplicit
    ? normalizedDamageRollDistribution.length
    : lastIndex

  for (let rawValue = 0; rawValue < explicitEnd; rawValue += 1) {
    const probability = normalizedDamageRollDistribution[rawValue]
    const value = fixedValueDifference >= 0
      ? rawValue + fixedValueDifference
      : rawValue
    if (value > plan.workingMax) {
      overflowProbability += probability
    } else {
      distribution[value] += probability
    }
  }
  if (!rawSupportEndIsExplicit) {
    overflowProbability += normalizedDamageRollDistribution[lastIndex]
  }

  if (defence.dice > 0) {
    distribution = subDistribution(
      distribution,
      getFiniteDefenceDistribution(
        getD10Distribution,
        defence,
        plan
      ),
      {
        fftLength: Math.max(
          RUNTIME_DAMAGE_MIN_FFT_SIZE,
          plan.defenceFftLength
        ),
        onFftLength,
      }
    )
  }
  if (fixedValueDifference < 0) {
    distribution = shiftDistribution(distribution, fixedValueDifference)
  }

  if (!Number.isFinite(failureProbability) || failureProbability < 0) {
    throw new RangeError('failure probability must be finite and non-negative')
  }
  distribution[0] += failureProbability

  return {
    distribution,
    overflowProbability,
    plan,
  }
}

function finalizePlannedDamage(
  damageRollDistribution,
  failureProbability,
  attack,
  defence,
  getD10Distribution,
  damageRangePlan,
  onFftLength
) {
  const composed = composePlannedDamage(
    damageRollDistribution,
    failureProbability,
    attack,
    defence,
    getD10Distribution,
    damageRangePlan,
    onFftLength
  )
  const distribution = collapseDistribution(composed.distribution)
  distribution[OUTPUT_DISTRIBUTION_SIZE - 1] +=
    composed.overflowProbability

  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}

function validateCanonicalRangePlan(rangePlan, attack, defence) {
  if (!rangePlan || typeof rangePlan !== 'object' || Array.isArray(rangePlan)) {
    throw new TypeError('rangePlan must be a top-level range plan object')
  }
  if (rangePlan.operation !== 'attack' || rangePlan.accepted !== true) {
    throw new TypeError('rangePlan must be an accepted top-level attack plan')
  }
  if (
    rangePlan.propagation?.score !== 'published-bucket' ||
    rangePlan.damage?.scoreValueMode !== 'published-bucket'
  ) {
    throw new RangeError(
      'canonical damage currently requires published-bucket score propagation'
    )
  }
  if (!Array.isArray(rangePlan.scores) || rangePlan.scores.length === 0) {
    throw new TypeError('rangePlan.scores must contain score plans')
  }

  const scoreTails = rangePlan.scores.map((score, index) => {
    if (!score?.tail || typeof score.tail !== 'object' || Array.isArray(score.tail)) {
      throw new TypeError(`rangePlan.scores[${index}].tail must be an object`)
    }
    return Object.freeze({ ...score.tail })
  })

  return {
    damage: validateDamageRangePlan(rangePlan.damage, attack, defence),
    scoreTails: Object.freeze(scoreTails),
  }
}

function getModeledDamageSupportMax(plan, attack, defence) {
  const fixedValueDifference = attack.value - defence.value
  if (!Number.isSafeInteger(fixedValueDifference)) {
    throw new RangeError('attack and defence fixed difference must be a safe integer')
  }
  const shiftedRawSupportMax = plan.rawSupportMax + fixedValueDifference
  if (!Number.isSafeInteger(shiftedRawSupportMax)) {
    throw new RangeError('shifted raw damage support max must be a safe integer')
  }
  const defendedSupportMax = shiftedRawSupportMax - defence.dice
  if (!Number.isSafeInteger(defendedSupportMax)) {
    throw new RangeError('modeled damage support max must be a safe integer')
  }
  return Math.max(0, defendedSupportMax)
}

function getFinalOverflowLowerBound(plan, attack, defence) {
  const fixedValueDifference = attack.value - defence.value
  if (!Number.isSafeInteger(fixedValueDifference)) {
    throw new RangeError('attack and defence fixed difference must be a safe integer')
  }
  const workingBoundary = plan.workingMax + 1
  if (!Number.isSafeInteger(workingBoundary)) {
    throw new RangeError('damage working overflow boundary must be a safe integer')
  }
  const shiftedLowerBound = fixedValueDifference >= 0
    ? workingBoundary - plan.defenceMax
    : workingBoundary - plan.defenceMax + fixedValueDifference
  if (!Number.isSafeInteger(shiftedLowerBound)) {
    throw new RangeError('final damage overflow lower bound must be a safe integer')
  }
  return Math.max(0, shiftedLowerBound)
}

function sumDistributionFrom(distribution, lowerBound) {
  let total = 0
  for (
    let index = Math.max(0, lowerBound);
    index < distribution.length;
    index += 1
  ) {
    total += distribution[index]
  }
  return total
}

function sumProbabilities(values) {
  return values.reduce((total, probability) => total + probability, 0)
}

async function requestDamageRollDistribution(
  score,
  attack,
  defence,
  getDamageRollDistribution,
  runtimeOptions,
  damageRangePlan
) {
  const request = createDamageRollRequest(score, attack)
  const planned = damageRangePlan !== undefined && damageRangePlan !== null
  const normalizedPlan = planned
    ? validateDamageRangePlan(damageRangePlan, attack, defence)
    : null
  const providerOptions = planned
    ? {
        ...runtimeOptions,
        fftLength: Math.max(
          RUNTIME_DAMAGE_MIN_FFT_SIZE,
          normalizedPlan.fftLength
        ),
        distributionLength: getPlannedRawDistributionLength(
          normalizedPlan,
          attack.value - defence.value
        ),
        rawSupportMax: normalizedPlan.rawSupportMax,
      }
    : runtimeOptions
  const damageRollDistribution = await getDamageRollDistribution(
    request.weights,
    attack.kazanari,
    providerOptions
  )
  const hitProbability = sumProbabilities(request.weights)
  const expectedLength = planned
    ? providerOptions.distributionLength
    : WORKING_DISTRIBUTION_SIZE

  return {
    damageRollDistribution: validateDamageRollDistribution(
      damageRollDistribution,
      expectedLength,
      hitProbability
    ),
    failureProbability: request.failureProbability,
    hitProbability,
    normalizedPlan,
  }
}

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
  getD10Distribution,
  damageRangePlan,
  onFftLength
) {
  if (damageRangePlan !== undefined && damageRangePlan !== null) {
    return finalizePlannedDamage(
      damageRollDistribution,
      failureProbability,
      attack,
      defence,
      getD10Distribution,
      damageRangePlan,
      onFftLength
    )
  }

  if (
    !isProbabilityArray(damageRollDistribution) ||
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
  {
    getDamageRollDistribution,
    getD10Distribution,
    onFftLength,
  } = {},
  runtimeOptions = {},
  damageRangePlan
) {
  if (typeof getDamageRollDistribution !== 'function') {
    throw new TypeError(
      'getDamageRollDistribution must provide a function'
    )
  }

  const requested = await requestDamageRollDistribution(
    score,
    attack,
    defence,
    getDamageRollDistribution,
    runtimeOptions,
    damageRangePlan
  )

  return finalizeOnDemandDamage(
    requested.damageRollDistribution,
    requested.failureProbability,
    attack,
    defence,
    getD10Distribution,
    requested.normalizedPlan,
    onFftLength
  )
}

export async function calculateCanonicalDamageOnDemand(
  score,
  attack,
  defence,
  {
    getDamageRollDistribution,
    getD10Distribution,
    onFftLength,
  } = {},
  runtimeOptions = {},
  rangePlan
) {
  if (typeof getDamageRollDistribution !== 'function') {
    throw new TypeError(
      'getDamageRollDistribution must provide a function'
    )
  }

  const canonicalPlan = validateCanonicalRangePlan(
    rangePlan,
    attack,
    defence
  )
  const requested = await requestDamageRollDistribution(
    score,
    attack,
    defence,
    getDamageRollDistribution,
    runtimeOptions,
    canonicalPlan.damage
  )
  const totalProbability =
    requested.failureProbability + requested.hitProbability
  if (
    !Number.isFinite(totalProbability) ||
    Math.abs(totalProbability - 1) > TOTAL_TOLERANCE
  ) {
    throw new RangeError(
      'failure probability plus hit probability must be approximately one'
    )
  }

  const composed = composePlannedDamage(
    requested.damageRollDistribution,
    requested.failureProbability,
    attack,
    defence,
    getD10Distribution,
    requested.normalizedPlan,
    onFftLength
  )
  const modeledSupportMax = getModeledDamageSupportMax(
    composed.plan,
    attack,
    defence
  )
  const modeledSupport = Object.freeze({
    kind: 'finite',
    max: modeledSupportMax,
  })
  const sourceSupport = Object.freeze({ kind: 'infinite' })
  let explicitMax = Math.min(
    composed.plan.workingMax,
    modeledSupportMax
  )
  let overflow = null
  if (modeledSupportMax <= composed.plan.workingMax) {
    if (composed.overflowProbability > TOTAL_TOLERANCE) {
      throw new RangeError(
        'planned damage overflow must be zero within finite modeled support'
      )
    }
  } else {
    const finalOverflowLowerBound = getFinalOverflowLowerBound(
      composed.plan,
      attack,
      defence
    )
    const explicitMaxBeforeOverflow = Math.min(
      modeledSupportMax,
      finalOverflowLowerBound - 1
    )
    const knownFinalOverflowProbability = sumDistributionFrom(
      composed.distribution,
      finalOverflowLowerBound
    )
    const exactOverflowProbability =
      composed.overflowProbability + knownFinalOverflowProbability
    explicitMax = explicitMaxBeforeOverflow
    overflow = {
      kind: 'exact',
      lowerBound: finalOverflowLowerBound,
      probability: exactOverflowProbability,
      errorBound: TOTAL_TOLERANCE,
    }
  }

  const result = createDistributionResult({
    values: explicitMax < 0
      ? []
      : composed.distribution.slice(0, explicitMax + 1),
    offset: 0,
    support: modeledSupport,
    overflow,
  })
  const metadata = Object.freeze({
    modeledDistribution: true,
    scorePropagation: 'published-bucket',
    scoreTails: canonicalPlan.scoreTails,
    modeledSupport,
    sourceSupport,
  })

  return Object.freeze({ result, metadata })
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
