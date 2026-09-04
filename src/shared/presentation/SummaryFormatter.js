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

function getStableBoundedDisplayValue(value) {
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
  const roundedLowerBound = roundScoreValue(value.lowerBound)
  const roundedUpperBound = roundScoreValue(value.upperBound)
  return roundedLowerBound !== null
    && roundedLowerBound === roundedUpperBound
    ? roundedLowerBound
    : null
}

/**
 * Preserve the legacy one-decimal summary appearance without converting a
 * bounded or lower-bound expected value into a point estimate.
 */
export function formatSummaryExpectedValue(expectedValue) {
  if (!isExactFiniteExpectedValue(expectedValue)) {
    return SUMMARY_UNAVAILABLE
  }
  const rounded = Math.round(expectedValue.value * 10) / 10
  return Number.isFinite(rounded)
    ? rounded
    : SUMMARY_UNAVAILABLE
}

export function formatScoreSummaryExpectedValue(expectedValue) {
  if (isExactFiniteExpectedValue(expectedValue)) {
    return roundScoreValue(expectedValue.value)
      ?? SUMMARY_UNAVAILABLE
  }
  return getStableBoundedDisplayValue(expectedValue)
    ?? SUMMARY_UNAVAILABLE
}

export function formatScoreSuccessRate(successRate) {
  if (successRate?.kind === 'exact') {
    return typeof successRate.value === 'number'
      && Number.isFinite(successRate.value)
      ? successRate.value
      : SUMMARY_UNAVAILABLE
  }
  return getStableBoundedDisplayValue(successRate)
    ?? SUMMARY_UNAVAILABLE
}

/**
 * Format the already-certified success-rate value for a summary table.
 * Numeric values retain the published percent suffix; unavailable values are
 * represented by the neutral dash without a misleading suffix.
 */
export function formatScoreSuccessRateDisplay(successRate) {
  const formatted = formatScoreSuccessRate(successRate)
  return typeof formatted === 'number' && Number.isFinite(formatted)
    ? `${formatted}%`
    : SUMMARY_UNAVAILABLE
}
