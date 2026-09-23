import { roundToOneDecimal } from './DecimalRounding'

export const SUMMARY_UNAVAILABLE = '—'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isExactFiniteExpectedValue(expectedValue: unknown): expectedValue is {
  readonly kind: 'exact'
  readonly value: number
} {
  return isRecord(expectedValue)
    && expectedValue.kind === 'exact'
    && typeof expectedValue.value === 'number'
    && Number.isFinite(expectedValue.value)
}

function roundScoreValue(value: number): number | null {
  const rounded = roundToOneDecimal(value)
  if (!Number.isFinite(rounded)) {
    return null
  }
  return Object.is(rounded, -0) ? 0 : rounded
}

function getStableBoundedDisplayValue(
  value: unknown,
  scale = 1,
): number | null {
  if (
    !isRecord(value)
    || value.kind !== 'bounded'
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
export function formatCertifiedExpectedValue(
  expectedValue: unknown,
): number | typeof SUMMARY_UNAVAILABLE {
  if (isExactFiniteExpectedValue(expectedValue)) {
    return roundScoreValue(expectedValue.value)
      ?? SUMMARY_UNAVAILABLE
  }
  return getStableBoundedDisplayValue(expectedValue)
    ?? SUMMARY_UNAVAILABLE
}

export function formatSummaryExpectedValue(
  expectedValue: unknown,
): number | typeof SUMMARY_UNAVAILABLE {
  return formatCertifiedExpectedValue(expectedValue)
}

export function formatScoreStatisticsExpectedValue(
  expectedValue: unknown,
): number | typeof SUMMARY_UNAVAILABLE {
  return formatCertifiedExpectedValue(expectedValue)
}

export function formatCertifiedProbabilityPercent(
  successProbability: unknown,
): number | typeof SUMMARY_UNAVAILABLE {
  if (isRecord(successProbability) && successProbability.kind === 'exact') {
    return typeof successProbability.value === 'number'
      && Number.isFinite(successProbability.value)
      ? roundScoreValue(successProbability.value * 100) ?? SUMMARY_UNAVAILABLE
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
export function formatCertifiedProbabilityPercentDisplay(
  successProbability: unknown,
): string | typeof SUMMARY_UNAVAILABLE {
  const formatted = formatCertifiedProbabilityPercent(successProbability)
  return typeof formatted === 'number' && Number.isFinite(formatted)
    ? `${formatted}%`
    : SUMMARY_UNAVAILABLE
}
