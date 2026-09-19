import { shiftDistribution } from '../core/probability/Distribution'
import { subDistribution } from '../core/probability/FFT'
import { calculateD10Distribution } from './D10Calculator'
import {
  RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE,
  RUNTIME_DAMAGE_MIN_FFT_SIZE,
} from './RuntimeDamageRollLimits'
import { createDistributionResult } from './DistributionResult'
import {
  createDamageExpectationCertificate,
} from './DamageExpectationCertificate'
import { createDamageRollRequest } from './DamageRollRequest'

const PROBABILITY_TOLERANCE = 1e-10
const TOTAL_TOLERANCE = 1e-8

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
  const expectedLength = providerOptions.distributionLength

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
  if (!Number.isFinite(totalProbability) || totalProbability < 0) {
    throw new RangeError(
      'failure probability plus hit probability must be finite and non-negative'
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
  const sourceSupport = requested.sourceSupport

  {
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
    const damageExpectationCertificate = createDamageExpectationCertificate(
      composed,
      values,
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
}

export { createDamageRollRequest } from './DamageRollRequest'
