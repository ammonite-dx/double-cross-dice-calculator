import {
  WORKING_DISTRIBUTION_SIZE,
  shiftDistribution,
} from '../core/probability/Distribution'
import { subDistribution } from '../core/probability/FFT'
import { calculateD10Distribution } from './D10Calculator'
import {
  RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE,
  RUNTIME_DAMAGE_MIN_FFT_SIZE,
  RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH,
} from './RuntimeDamageRollLimits'
import { createBoundedCertifiedValue } from '../domain/CertifiedValue'
import {
  createDistributionResult,
  getCertifiedExpectedValue,
  getProbabilityMassSummary,
  validateDistributionResult,
} from './DistributionResult'

const PROBABILITY_TOLERANCE = 1e-10
const TOTAL_TOLERANCE = 1e-8
const DAMAGE_EXPECTATION_CERTIFICATE_VERSION = 1

function getRuntimeD10Distribution(dice, size, runtimeOptions = {}) {
  return calculateD10Distribution(dice, {
    size,
    signal: runtimeOptions.signal,
  })
}

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
  damageRangePlan,
  runtimeOptions = {}
) {
  const provider = getD10Distribution ?? getRuntimeD10Distribution
  if (typeof provider !== 'function') {
    throw new TypeError('getD10Distribution must provide a function')
  }

  const expectedLength = damageRangePlan.defenceMax + 1
  const source = provider(defence.dice, expectedLength, runtimeOptions)
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
  onFftLength,
  runtimeOptions = {}
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
        plan,
        runtimeOptions
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

function validateRangePlan(rangePlan, attack, defence) {
  if (!rangePlan || typeof rangePlan !== 'object' || Array.isArray(rangePlan)) {
    throw new TypeError('rangePlan must be a top-level range plan object')
  }
  if (rangePlan.operation !== 'attack' || rangePlan.accepted !== true) {
    throw new TypeError('rangePlan must be an accepted top-level attack plan')
  }
  const scorePropagation = rangePlan.propagation?.score
  if (!['published-bucket', 'full-tail'].includes(scorePropagation)) {
    throw new RangeError(
      'damage requires a published-bucket or full-tail score propagation plan'
    )
  }
  if (rangePlan.damage?.scoreValueMode !== scorePropagation) {
    throw new RangeError(
      'damage score propagation must match the damage scoreValueMode'
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
    scorePropagation,
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
  let total = 0
  let compensation = 0
  for (const probability of values) {
    const corrected = probability - compensation
    const next = total + corrected
    compensation = (next - total) - corrected
    total = next
  }
  return total
}

function sumExplicitFirstMoment(values, offset = 0) {
  let total = 0
  let compensation = 0
  for (let index = 0; index < values.length; index += 1) {
    const term = (offset + index) * values[index]
    const corrected = term - compensation
    const next = total + corrected
    compensation = (next - total) - corrected
    total = next
  }
  return total
}

function validateScoreEnvelope(envelope, label) {
  if (
    envelope === null ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    envelope.result === null ||
    typeof envelope.result !== 'object'
  ) {
    throw new TypeError(
      `${label} must be a score envelope with a result`
    )
  }

  validateDistributionResult(envelope.result)
  const { result } = envelope
  let explicitMass = 0
  for (const probability of result.values) {
    explicitMass += probability
  }

  const overflow = result.overflow
  const overflowMassUpperBound = overflow === null
    ? 0
    : overflow.kind === 'exact'
      ? overflow.probability
      : overflow.probabilityUpperBound
  const errorBound = overflow?.errorBound ?? 0
  const certificate = envelope.metadata?.scoreTailCertificate
  const certificateErrorBound = Number.isFinite(
    certificate?.probabilityErrorBound
  )
    ? certificate.probabilityErrorBound
    : 0

  return {
    envelope,
    result,
    explicitMass,
    overflowMassUpperBound,
    errorBound,
    certificateErrorBound,
    certificate: certificate === null || typeof certificate !== 'object'
      ? null
      : Object.freeze({ ...certificate }),
    momentCertificate:
      envelope.metadata?.scoreTailMomentCertificate === null
      || typeof envelope.metadata?.scoreTailMomentCertificate !== 'object'
        ? null
        : Object.freeze({ ...envelope.metadata.scoreTailMomentCertificate }),
  }
}

function isValidScoreTailMassCertificate(certificate) {
  return certificate !== null
    && typeof certificate === 'object'
    && certificate.version === 1
    && certificate.kind === 'score-tail-certificate'
    && Number.isFinite(certificate.massLowerBound)
    && Number.isFinite(certificate.massUpperBound)
    && certificate.massLowerBound >= 0
    && certificate.massUpperBound >= certificate.massLowerBound
    && certificate.massUpperBound <= 1
    && Number.isFinite(certificate.probabilityErrorBound)
    && certificate.probabilityErrorBound >= 0
    && (
      certificate.massUpperBound === 0
      || Number.isFinite(certificate.lowerBound)
    )
}

function isValidScoreTailMomentCertificate(certificate) {
  return certificate !== null
    && typeof certificate === 'object'
    && certificate.version === 1
    && certificate.kind === 'score-tail-moment-certificate'
    && typeof certificate.model === 'string'
    && Number.isSafeInteger(certificate.modeledMax)
    && certificate.modeledMax >= 0
    && Number.isFinite(certificate.massUpperBound)
    && certificate.massUpperBound >= 0
    && certificate.massUpperBound <= 1
    && Number.isFinite(certificate.firstMomentUpperBound)
    && certificate.firstMomentUpperBound >= 0
    && Number.isFinite(certificate.numericalErrorBound)
    && certificate.numericalErrorBound >= 0
}

function getScoreExplicitMax(score) {
  return score.result.values.length === 0
    ? null
    : score.result.offset + score.result.values.length - 1
}

function getDamageExpectationCertificate(
  composed,
  values,
  explicitMax,
  requested,
  attack,
  defence
) {
  // A dedicated tail-only certificate describes the full-tail production
  // result. Any actual modeled Damage output overflow needs its own positional
  // treatment and therefore fails closed here.
  if (composed.overflowProbability !== 0) {
    return null
  }

  const [actionMassCertificate, reactionMassCertificate] =
    requested.scoreTailCertificates ?? []
  if (
    !isValidScoreTailMassCertificate(actionMassCertificate)
    || !isValidScoreTailMassCertificate(reactionMassCertificate)
  ) {
    return null
  }

  const [actionMomentCertificate] =
    requested.scoreTailMomentCertificates ?? []
  const actionTailMass = actionMassCertificate.massUpperBound
  const reactionTailMass = reactionMassCertificate.massUpperBound

  let actionTailContributionUpperBound = 0
  if (actionTailMass > 0) {
    if (!isValidScoreTailMomentCertificate(actionMomentCertificate)) {
      return null
    }
    if (actionMomentCertificate.massUpperBound < actionTailMass) {
      return null
    }
  } else if (
    isValidScoreTailMomentCertificate(actionMomentCertificate)
    && actionMomentCertificate.firstMomentUpperBound !== 0
  ) {
    return null
  }

  const maxDamageConstant =
    10 * (1 + attack.dice)
    + Math.max(0, attack.value - defence.value)
  if (!Number.isFinite(maxDamageConstant) || maxDamageConstant < 0) {
    return null
  }

  if (actionTailMass > 0) {
    const actionMomentMass = Math.max(
      actionTailMass,
      actionMomentCertificate.massUpperBound
    )
    actionTailContributionUpperBound =
      actionMomentCertificate.firstMomentUpperBound
      + maxDamageConstant * actionMomentMass
  }

  const actionExplicitMax = requested.actionExplicitMax
  let reactionTailContributionUpperBound = 0
  if (reactionTailMass > 0 && actionExplicitMax === null) {
    // Without an explicit action maximum there is no safe way to decide
    // whether a reaction tail can win. Treat the missing positional bound as
    // unsupported instead of silently assigning a zero contribution.
    return null
  }
  if (reactionTailMass > 0) {
    const reactionTailLowerBound = reactionMassCertificate.lowerBound
    const cannotWin = Number.isFinite(reactionTailLowerBound)
      && actionExplicitMax <= reactionTailLowerBound
    if (!cannotWin) {
      reactionTailContributionUpperBound =
        reactionTailMass * (
          Math.max(0, actionExplicitMax) + maxDamageConstant
        )
    }
  }

  if (
    !Number.isFinite(actionTailContributionUpperBound)
    || !Number.isFinite(reactionTailContributionUpperBound)
    || actionTailContributionUpperBound < 0
    || reactionTailContributionUpperBound < 0
    || (actionTailMass === 0 && reactionTailContributionUpperBound === 0
      && reactionTailMass === 0)
  ) {
    // Keep finite no-tail results on the generic exact path. A bounded
    // certificate is only needed when some score tail is actually present.
    return null
  }

  const explicitFirstMoment = sumExplicitFirstMoment(values)
  if (!Number.isFinite(explicitFirstMoment) || explicitFirstMoment < 0) {
    return null
  }

  // The explicit prefix is produced by the validated full-tail composition.
  // Use the existing total-mass tolerance as a scale-aware bound for its
  // summation and for the final propagation arithmetic. This is a producer
  // contract, not a fixed expected-value epsilon.
  const explicitScale = Math.max(
    1,
    explicitMax === null ? 0 : explicitMax + 1,
    Math.abs(explicitFirstMoment)
  )
  const explicitMomentErrorBound = TOTAL_TOLERANCE * explicitScale
  const contributionScale = Math.max(
    1,
    Math.abs(explicitFirstMoment),
    Math.abs(actionTailContributionUpperBound),
    Math.abs(reactionTailContributionUpperBound)
  )
  const propagationArithmeticErrorBound = TOTAL_TOLERANCE * contributionScale
  const numericalErrorBound =
    explicitMomentErrorBound + propagationArithmeticErrorBound
  const lowerBound = Math.max(
    0,
    explicitFirstMoment - numericalErrorBound
  )
  const upperBound =
    explicitFirstMoment
    + actionTailContributionUpperBound
    + reactionTailContributionUpperBound
    + numericalErrorBound

  if (
    !Number.isFinite(numericalErrorBound)
    || numericalErrorBound < 0
    || !Number.isFinite(lowerBound)
    || !Number.isFinite(upperBound)
    || lowerBound < 0
    || upperBound < lowerBound
  ) {
    return null
  }

  return Object.freeze({
    version: DAMAGE_EXPECTATION_CERTIFICATE_VERSION,
    kind: 'damage-expectation-certificate',
    lowerBound,
    upperBound,
    explicitFirstMoment,
    actionTailContributionUpperBound,
    reactionTailContributionUpperBound,
    numericalErrorBound,
    explicitMomentErrorBound,
    propagationArithmeticErrorBound,
    actionTailMassUpperBound: actionTailMass,
    reactionTailMassUpperBound: reactionTailMass,
    maxDamageConstant,
  })
}

function getReactionExplicitBelowLookup(reaction) {
  const prefix = new Float64Array(reaction.result.values.length + 1)
  for (let index = 0; index < reaction.result.values.length; index += 1) {
    prefix[index + 1] = prefix[index] + reaction.result.values[index]
  }

  return (scoreValue) => {
    if (scoreValue <= reaction.result.offset) {
      return 0
    }
    const explicitMax = reaction.result.offset + reaction.result.values.length
    if (scoreValue >= explicitMax) {
      return prefix[prefix.length - 1]
    }
    return prefix[scoreValue - reaction.result.offset]
  }
}

function getScoreSourceSupport(action, reaction) {
  if (
    action.result.support.kind === 'finite' &&
    reaction.result.support.kind === 'finite'
  ) {
    return Object.freeze({
      kind: 'finite',
      max: Math.max(action.result.support.max, reaction.result.support.max),
    })
  }
  return Object.freeze({ kind: 'infinite' })
}

async function requestDamageRollDistribution(
  score,
  attack,
  defence,
  getDamageRollDistribution,
  runtimeOptions,
  damageRangePlan
) {
  const request = createDamageRollRequest(
    score,
    attack,
    damageRangePlan
  )
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
    unmodeledScoreProbabilityUpperBound:
      request.unmodeledScoreProbabilityUpperBound ?? 0,
    scoreTailErrorBound: request.scoreTailErrorBound ?? 0,
    scoreTailCertificates: request.scoreTailCertificates ?? [],
    scoreTailMomentCertificates: request.scoreTailMomentCertificates ?? [],
    actionExplicitMax: request.actionExplicitMax ?? null,
    sourceSupport: request.sourceSupport ?? Object.freeze({ kind: 'infinite' }),
  }
}

/**
 * Build a damage-roll request directly from score coverage.
 * Explicit score values are paired with explicit reaction values only. Any
 * score tail is retained as an unmodeled probability bound rather than being
 * folded into the last damage-dice coefficient.
 */
export function createDamageRollRequest(
  score,
  attack,
  damageRangePlan
) {
  const action = validateScoreEnvelope(score?.action, 'score.action')
  const reaction = validateScoreEnvelope(
    score?.reaction,
    'score.reaction'
  )
  const reactionExplicitBelow = getReactionExplicitBelowLookup(reaction)
  const maxDamageDice = damageRangePlan?.maxDamageDice
    ?? (
      Math.floor(
        Math.max(0, action.result.offset + action.result.values.length - 1) /
          10
      ) + 1 + attack.dice
    )

  if (
    !Number.isSafeInteger(maxDamageDice) ||
    maxDamageDice < 0 ||
    maxDamageDice + 1 > RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH
  ) {
    throw new TypeError(
      'full-tail damage plan maxDamageDice must fit the runtime damage weight length'
    )
  }
  const weights = new Float64Array(maxDamageDice + 1)
  let failureProbability = 0
  let hitProbability = 0

  for (let index = 0; index < action.result.values.length; index += 1) {
    const actionProbability = action.result.values[index]
    if (actionProbability === 0) {
      continue
    }

    const scoreValue = action.result.offset + index
    const reactionBelow = reactionExplicitBelow(scoreValue)
    const reactionFailure = Math.max(
      0,
      reaction.explicitMass - reactionBelow
    )
    failureProbability += actionProbability * reactionFailure

    const hit = actionProbability * reactionBelow
    if (hit === 0) {
      continue
    }

    const damageDice =
      Math.floor(scoreValue / 10) + 1 + attack.dice
    if (damageDice < 0 || damageDice >= weights.length) {
      throw new RangeError(
        `damage dice are outside the planned full-tail range: ${damageDice}`
      )
    }
    weights[damageDice] += hit
    hitProbability += hit
  }

  const explicitPairMass = action.explicitMass * reaction.explicitMass
  const independentTailPairUpperBound =
    action.overflowMassUpperBound +
    reaction.overflowMassUpperBound -
    action.overflowMassUpperBound * reaction.overflowMassUpperBound
  const scoreTailMassUpperBound = Math.max(
    0,
    Math.min(
      1,
      Math.max(1 - explicitPairMass, independentTailPairUpperBound)
    )
  )
  const scoreTailErrorBound =
    Math.max(action.errorBound, action.certificateErrorBound) +
    Math.max(reaction.errorBound, reaction.certificateErrorBound)

  return {
    failureProbability,
    hitProbability,
    weights,
    unmodeledScoreProbabilityUpperBound: scoreTailMassUpperBound,
    scoreTailErrorBound,
    scoreTailCertificates: Object.freeze([
      action.certificate,
      reaction.certificate,
    ]),
    scoreTailMomentCertificates: Object.freeze([
      action.momentCertificate,
      reaction.momentCertificate,
    ]),
    actionExplicitMax: getScoreExplicitMax(action),
    sourceSupport: getScoreSourceSupport(action, reaction),
  }
}

export async function calculateDamageOnDemand(
  score,
  attack,
  defence,
  {
    getDamageRollDistribution,
    getD10Distribution = getRuntimeD10Distribution,
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

  const plan = validateRangePlan(
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
    plan.damage
  )
  const totalProbability =
    requested.failureProbability + requested.hitProbability
  if (
    plan.scorePropagation === 'published-bucket' &&
    (
      !Number.isFinite(totalProbability) ||
      Math.abs(totalProbability - 1) > TOTAL_TOLERANCE
    )
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
    onFftLength,
    runtimeOptions
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
  const sourceSupport = plan.scorePropagation === 'full-tail'
    ? requested.sourceSupport
    : Object.freeze({ kind: 'infinite' })

  if (plan.scorePropagation === 'full-tail') {
    const explicitMax = Math.min(
      composed.plan.workingMax,
      modeledSupportMax
    )
    const values = explicitMax < 0
      ? []
      : composed.distribution.slice(0, explicitMax + 1)
    const explicitMass = sumProbabilities(values)
    const scoreTailProbabilityUpperBound = Math.min(
      1,
      requested.unmodeledScoreProbabilityUpperBound
    )
    const explicitMassGap = Math.max(0, 1 - explicitMass)
    const effectiveExplicitMassGap = explicitMassGap > TOTAL_TOLERANCE
      ? explicitMassGap
      : 0
    const modeledMassGap = Math.max(
      0,
      explicitMassGap - scoreTailProbabilityUpperBound
    )
    // A finite modeled distribution can lose a few ulps while being mixed
    // and composed. Treat a gap within the existing total-mass tolerance as
    // numerical noise; otherwise it would manufacture an overflow bucket
    // without a valid positional lower bound.
    const effectiveModeledMassGap = modeledMassGap > TOTAL_TOLERANCE
      ? modeledMassGap
      : 0
    const numericalResidual = Math.max(
      0,
      effectiveModeledMassGap - composed.overflowProbability
    )
    const outputOverflowProbabilityUpperBound = Math.min(
      1,
      Math.max(composed.overflowProbability, effectiveModeledMassGap)
    )
    const scoreTailErrorBound = requested.scoreTailErrorBound
    // Keep the previous conservative aggregation as a floor. The explicit
    // mass gap can already include damage-output overflow, so replacing it
    // with a disjoint-looking score/output sum would otherwise weaken the
    // published upper bound for mixed-tail cases.
    const previousConservativeUpperBound = Math.min(
      1,
      Math.max(
        scoreTailProbabilityUpperBound,
        effectiveExplicitMassGap
      ) + composed.overflowProbability
    )
    const overflowProbabilityUpperBound = Math.min(
      1,
      Math.max(
        previousConservativeUpperBound,
        scoreTailProbabilityUpperBound +
          outputOverflowProbabilityUpperBound
      )
    )
    const overflowErrorBound =
      scoreTailErrorBound +
      (composed.overflowProbability > 0 || numericalResidual > 0
        ? TOTAL_TOLERANCE
        : 0)
    const hasUnmodeledTail =
      overflowProbabilityUpperBound > 0 ||
      overflowErrorBound > 0
    const hasPositionallyUncertainScoreTail =
      scoreTailProbabilityUpperBound > 0 ||
      scoreTailErrorBound > 0 ||
      numericalResidual > 0
    const positionUnknownProbabilityUpperBound = Math.min(
      1,
      scoreTailProbabilityUpperBound +
        scoreTailErrorBound +
        numericalResidual
    )
    const outputOverflowLowerBound = composed.overflowProbability > 0
      ? getFinalOverflowLowerBound(composed.plan, attack, defence)
      : null
    const damageExpectationCertificate = getDamageExpectationCertificate(
      composed,
      values,
      explicitMax < 0 ? null : explicitMax,
      requested,
      attack,
      defence
    )
    const outputSupport = hasUnmodeledTail || sourceSupport.kind === 'infinite'
      ? Object.freeze({ kind: 'infinite' })
      : modeledSupport
    const overflow = hasUnmodeledTail
      ? {
          kind: 'upper-bound',
          // score tails are not damage-output tails: an unmodeled action or
          // reaction score can affect a low damage coordinate (including
          // failure at zero). Only overflow created after the damage output
          // has been composed can use its positional lower bound.
          lowerBound: hasPositionallyUncertainScoreTail
            ? 0
            : outputOverflowLowerBound,
          probabilityUpperBound: overflowProbabilityUpperBound,
          errorBound: overflowErrorBound,
        }
      : null
    const result = createDistributionResult({
      values,
      offset: 0,
      support: outputSupport,
      overflow,
    })
    const metadata = Object.freeze({
      modeledDistribution: true,
      scorePropagation: 'full-tail',
      scoreTails: plan.scoreTails,
      scoreTailCertificates: requested.scoreTailCertificates,
      scoreTailMomentCertificates: requested.scoreTailMomentCertificates,
      scoreTailProbabilityUpperBound,
      scoreTailErrorBound,
      damageExpectationCertificate,
      projectionUncertainty: Object.freeze({
        positionUnknownProbabilityUpperBound,
        outputOverflowLowerBound: outputOverflowLowerBound !== null
          ? outputOverflowLowerBound
          : null,
      }),
      modeledSupport,
      sourceSupport,
    })

    return Object.freeze({ result, metadata })
  }

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
    scoreTails: plan.scoreTails,
    damageExpectationCertificate: null,
    modeledSupport,
    sourceSupport,
  })

  return Object.freeze({ result, metadata })
}

function isDamageEnvelope(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, 'result')
    && value.metadata !== null
    && typeof value.metadata === 'object'
    && !Array.isArray(value.metadata)
    && Object.prototype.hasOwnProperty.call(
      value.metadata,
      'modeledDistribution'
    )
    && value.metadata.modeledDistribution === true
}

function getCertifiedDamageExpectation(certificate) {
  if (
    certificate === null
    || typeof certificate !== 'object'
    || certificate.version !== DAMAGE_EXPECTATION_CERTIFICATE_VERSION
    || certificate.kind !== 'damage-expectation-certificate'
    || !Number.isFinite(certificate.lowerBound)
    || !Number.isFinite(certificate.upperBound)
    || certificate.lowerBound < 0
    || certificate.upperBound < certificate.lowerBound
    || !Number.isFinite(certificate.numericalErrorBound)
    || certificate.numericalErrorBound < 0
  ) {
    return null
  }

  try {
    return createBoundedCertifiedValue(
      certificate.lowerBound,
      certificate.upperBound
    )
  } catch {
    // Metadata is an optional producer contract. Malformed or stale
    // certificates must never prevent the generic result summary from being
    // used.
    return null
  }
}

/**
 * Summarize a damage envelope without converting it to legacy
 * buckets or copying its values buffer.
 */
export function getDamageStatistics(damage) {
  if (!isDamageEnvelope(damage)) {
    throw new TypeError(
      'damage summary expects an envelope with result and metadata'
    )
  }

  const expectedValue =
    getCertifiedDamageExpectation(
      damage.metadata.damageExpectationCertificate
    )
    ?? getCertifiedExpectedValue(damage.result)
  const mass = getProbabilityMassSummary(damage.result)
  return Object.freeze({ expectedValue, mass })
}
