export {
  CANONICAL_SUMMARY_UNAVAILABLE,
  formatCanonicalSummaryExpectedValue,
  formatCanonicalScoreSummaryExpectedValue,
  formatCanonicalScoreSuccessRate,
  formatCanonicalScoreSuccessRateDisplay,
} from '../../../presentation/CanonicalSummaryFormatter'

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
