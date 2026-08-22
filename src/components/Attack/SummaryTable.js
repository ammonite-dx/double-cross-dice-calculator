export const CANONICAL_SUMMARY_UNAVAILABLE = '表示できません'

function isExactFiniteExpectedValue(expectedValue) {
  return expectedValue?.kind === 'exact'
    && typeof expectedValue.value === 'number'
    && Number.isFinite(expectedValue.value)
}

function roundCanonicalScoreValue(value) {
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
  const roundedLowerBound = roundCanonicalScoreValue(value.lowerBound)
  const roundedUpperBound = roundCanonicalScoreValue(value.upperBound)
  return roundedLowerBound !== null
    && roundedLowerBound === roundedUpperBound
    ? roundedLowerBound
    : null
}

/**
 * Preserve the legacy one-decimal summary appearance without converting a
 * bounded or lower-bound canonical expected value into a point estimate.
 */
export function formatCanonicalSummaryExpectedValue(expectedValue) {
  if (!isExactFiniteExpectedValue(expectedValue)) {
    return CANONICAL_SUMMARY_UNAVAILABLE
  }
  const rounded = Math.round(expectedValue.value * 10) / 10
  return Number.isFinite(rounded)
    ? rounded
    : CANONICAL_SUMMARY_UNAVAILABLE
}

export function formatCanonicalScoreSummaryExpectedValue(expectedValue) {
  if (isExactFiniteExpectedValue(expectedValue)) {
    return roundCanonicalScoreValue(expectedValue.value) ?? '—'
  }
  return getStableBoundedDisplayValue(expectedValue) ?? '—'
}

export function formatCanonicalScoreSuccessRate(successRate) {
  if (successRate?.kind === 'exact') {
    return typeof successRate.value === 'number'
      && Number.isFinite(successRate.value)
      ? successRate.value
      : '—'
  }
  return getStableBoundedDisplayValue(successRate) ?? '—'
}

export function getCanonicalScoreSummaryForCombo(presentation, comboId) {
  if (presentation?.status !== 'ready') {
    return null
  }
  const combo = findCanonicalComboPresentation(presentation, comboId)
  return combo?.canonicalScoreBatchSummary ?? null
}

export function findCanonicalComboPresentation(presentation, comboId) {
  if (!Array.isArray(presentation?.combos)) {
    return null
  }
  return presentation.combos.find((combo) => combo?.id === comboId) ?? null
}
