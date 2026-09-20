export {
  SUMMARY_UNAVAILABLE,
  formatSummaryExpectedValue,
  formatScoreStatisticsExpectedValue,
  formatCertifiedProbabilityPercent,
  formatCertifiedProbabilityPercentDisplay,
} from '../../../shared/presentation/SummaryFormatter'

export function getScoreStatisticsForCombo(presentation, comboId) {
  if (presentation?.status !== 'ready') {
    return null
  }
  const combo = findComboPresentation(presentation, comboId)
  return combo?.scoreStatistics ?? null
}

export function findComboPresentation(presentation, comboId) {
  if (!Array.isArray(presentation?.combos)) {
    return null
  }
  return presentation.combos.find((combo) => combo?.id === comboId) ?? null
}
