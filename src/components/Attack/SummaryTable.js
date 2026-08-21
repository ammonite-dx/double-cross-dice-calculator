export const CANONICAL_SUMMARY_UNAVAILABLE = '表示できません'

function isExactFiniteExpectedValue(expectedValue) {
  return expectedValue?.kind === 'exact'
    && typeof expectedValue.value === 'number'
    && Number.isFinite(expectedValue.value)
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
  if (!isExactFiniteExpectedValue(expectedValue)) {
    return '—'
  }
  const rounded = Math.round(expectedValue.value * 10) / 10
  return Number.isFinite(rounded) ? rounded : '—'
}

export function formatCanonicalScoreSuccessRate(successRate) {
  if (
    successRate?.kind !== 'exact'
    || typeof successRate.value !== 'number'
    || !Number.isFinite(successRate.value)
  ) {
    return '—'
  }
  return successRate.value
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
