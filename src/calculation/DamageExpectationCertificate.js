import { createBoundedCertifiedValue } from '../domain/CertifiedValue'
import {
  isValidScoreTailCertificate,
  isValidScoreTailMomentCertificate,
} from './ScoreCertificates'

export const DAMAGE_EXPECTATION_CERTIFICATE_VERSION = 1

function sumExplicitFirstMoment(values) {
  let total = 0
  let compensation = 0
  for (let index = 0; index < values.length; index += 1) {
    const term = index * values[index]
    const corrected = term - compensation
    const next = total + corrected
    compensation = (next - total) - corrected
    total = next
  }
  return total
}

function isValidScoreTailMassCertificate(certificate) {
  return isValidScoreTailCertificate(certificate)
    && (
      certificate.massUpperBound === 0
      || Number.isFinite(certificate.lowerBound)
    )
}

/**
 * Build the Damage expected-value certificate from score-tail certificates.
 * The producer owns this operation because it is the boundary where score
 * coverage is translated into damage expectation semantics.
 */
export function createDamageExpectationCertificate(
  composed,
  values,
  requested,
  attack,
  defence,
) {
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

  const [actionMomentCertificate] = requested.scoreTailMomentCertificates ?? []
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
      actionMomentCertificate.massUpperBound,
    )
    actionTailContributionUpperBound =
      actionMomentCertificate.firstMomentUpperBound
      + maxDamageConstant * actionMomentMass
  }

  const actionExplicitMax = requested.actionExplicitMax
  let reactionTailContributionUpperBound = 0
  if (reactionTailMass > 0 && actionExplicitMax === null) {
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
    return null
  }

  const explicitFirstMoment = sumExplicitFirstMoment(values)
  if (!Number.isFinite(explicitFirstMoment) || explicitFirstMoment < 0) {
    return null
  }
  const lowerBound = explicitFirstMoment
  const upperBound =
    explicitFirstMoment
    + actionTailContributionUpperBound
    + reactionTailContributionUpperBound

  if (
    !Number.isFinite(lowerBound)
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
    actionTailMassUpperBound: actionTailMass,
    reactionTailMassUpperBound: reactionTailMass,
    maxDamageConstant,
  })
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0
}

/**
 * Validate the dedicated Damage expected-value contract.
 *
 * Only semantic interval fields are part of the contract. Optional
 * attribution fields are checked when present, while diagnostic fields from
 * older producers are deliberately ignored so a stale certificate can still
 * fall back safely to the generic result summary.
 */
export function isValidDamageExpectationCertificate(certificate) {
  if (
    !isRecord(certificate)
    || certificate.version !== DAMAGE_EXPECTATION_CERTIFICATE_VERSION
    || certificate.kind !== 'damage-expectation-certificate'
    || !isFiniteNonNegative(certificate.lowerBound)
    || !Number.isFinite(certificate.upperBound)
    || certificate.upperBound < certificate.lowerBound
  ) {
    return false
  }

  for (const field of [
    'explicitFirstMoment',
    'actionTailContributionUpperBound',
    'reactionTailContributionUpperBound',
    'maxDamageConstant',
    'actionTailMassUpperBound',
    'reactionTailMassUpperBound',
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(certificate, field)
      && !isFiniteNonNegative(certificate[field])
    ) {
      return false
    }
  }

  return true
}

/** Convert a valid dedicated certificate into the shared CertifiedValue type. */
export function getCertifiedDamageExpectation(certificate) {
  if (!isValidDamageExpectationCertificate(certificate)) {
    return null
  }

  try {
    return createBoundedCertifiedValue(
      certificate.lowerBound,
      certificate.upperBound
    )
  } catch {
    // Metadata is optional. A malformed or stale certificate must never block
    // the generic DistributionResult summary.
    return null
  }
}

function intervalFromGenericValue(value) {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null
  }
  if (value.kind === 'exact' && Number.isFinite(value.value)) {
    return Object.freeze({
      lowerBound: value.value,
      upperBound: value.value,
      source: 'generic-exact',
    })
  }
  if (
    value.kind === 'bounded'
    && Number.isFinite(value.lowerBound)
    && Number.isFinite(value.upperBound)
    && value.upperBound >= value.lowerBound
  ) {
    return Object.freeze({
      lowerBound: value.lowerBound,
      upperBound: value.upperBound,
      source: 'generic-bounded',
    })
  }
  return null
}

/**
 * Return the strongest finite expected-value interval available for a Damage
 * envelope. The generic calculator is injected to keep this module
 * independent from DistributionResult and avoid an import cycle.
 */
export function getFiniteDamageExpectationInterval(
  envelope,
  getGenericExpectedValue
) {
  if (!isRecord(envelope)) {
    return null
  }

  const dedicated = getCertifiedDamageExpectation(
    envelope.metadata?.damageExpectationCertificate
  )
  if (dedicated !== null) {
    return Object.freeze({
      lowerBound: dedicated.lowerBound,
      upperBound: dedicated.upperBound,
      source: 'damage-certificate',
    })
  }

  if (typeof getGenericExpectedValue !== 'function') {
    return null
  }
  try {
    return intervalFromGenericValue(
      getGenericExpectedValue(envelope.result)
    )
  } catch {
    return null
  }
}
