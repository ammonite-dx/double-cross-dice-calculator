import { createBoundedCertifiedValue } from '../domain/CertifiedValue'

export const DAMAGE_EXPECTATION_CERTIFICATE_VERSION = 1

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

