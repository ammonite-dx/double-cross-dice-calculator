export const SUMMARY_UNAVAILABLE = '—'

function isExactFiniteExpectedValue(expectedValue) {
  return expectedValue?.kind === 'exact'
    && typeof expectedValue.value === 'number'
    && Number.isFinite(expectedValue.value)
}

function roundScoreValue(value) {
  const rounded = Math.round(value * 10) / 10
  if (!Number.isFinite(rounded)) {
    return null
  }
  return Object.is(rounded, -0) ? 0 : rounded
}

function getStableBoundedDisplayValue(value, scale = 1) {
  if (
    value?.kind !== 'bounded'
    || typeof value.lowerBound !== 'number'
    || typeof value.upperBound !== 'number'
    || !Number.isFinite(value.lowerBound)
    || !Number.isFinite(value.upperBound)
    || value.lowerBound > value.upperBound
  ) {
    return null
  }
  const roundedLowerBound = roundScoreValue(value.lowerBound * scale)
  const roundedUpperBound = roundScoreValue(value.upperBound * scale)
  return roundedLowerBound !== null
    && roundedLowerBound === roundedUpperBound
    ? roundedLowerBound
    : null
}

/**
 * Format a certified expected value at the summary's one-decimal precision.
 * A bounded value is displayed only when both certified bounds round to the
 * same number; a lower-bound value never becomes a misleading point estimate.
 */
export function formatCertifiedExpectedValue(expectedValue) {
  if (isExactFiniteExpectedValue(expectedValue)) {
    return roundScoreValue(expectedValue.value)
      ?? SUMMARY_UNAVAILABLE
  }
  return getStableBoundedDisplayValue(expectedValue)
    ?? SUMMARY_UNAVAILABLE
}

export function formatSummaryExpectedValue(expectedValue) {
  return formatCertifiedExpectedValue(expectedValue)
}

export function formatScoreStatisticsExpectedValue(expectedValue) {
  return formatCertifiedExpectedValue(expectedValue)
}

export function formatCertifiedProbabilityPercent(successProbability) {
  if (successProbability?.kind === 'exact') {
    return typeof successProbability.value === 'number'
      && Number.isFinite(successProbability.value)
      ? roundScoreValue(successProbability.value * 100)
      : SUMMARY_UNAVAILABLE
  }
  return getStableBoundedDisplayValue(successProbability, 100)
    ?? SUMMARY_UNAVAILABLE
}

/**
 * Format the already-certified success-rate value for a summary table.
 * Numeric values retain the published percent suffix; unavailable values are
 * represented by the neutral dash without a misleading suffix.
 */
export function formatCertifiedProbabilityPercentDisplay(successProbability) {
  const formatted = formatCertifiedProbabilityPercent(successProbability)
  return typeof formatted === 'number' && Number.isFinite(formatted)
    ? `${formatted}%`
    : SUMMARY_UNAVAILABLE
}
