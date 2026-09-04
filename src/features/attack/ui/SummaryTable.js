export {
  SUMMARY_UNAVAILABLE,
  formatSummaryExpectedValue,
  formatScoreSummaryExpectedValue,
  formatScoreSuccessRate,
  formatScoreSuccessRateDisplay,
} from '../../../shared/presentation/SummaryFormatter'

export function getScoreSummaryForCombo(presentation, comboId) {
  if (presentation?.status !== 'ready') {
    return null
  }
  const combo = findComboPresentation(presentation, comboId)
  return combo?.scoreSummary ?? null
}

export function findComboPresentation(presentation, comboId) {
  if (!Array.isArray(presentation?.combos)) {
    return null
  }
  return presentation.combos.find((combo) => combo?.id === comboId) ?? null
}
