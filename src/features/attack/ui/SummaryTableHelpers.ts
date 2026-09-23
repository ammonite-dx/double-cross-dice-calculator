export {
  SUMMARY_UNAVAILABLE,
  formatSummaryExpectedValue,
  formatScoreStatisticsExpectedValue,
  formatCertifiedProbabilityPercent,
  formatCertifiedProbabilityPercentDisplay,
} from '../../../shared/presentation/SummaryFormatter'
import type { ScoreStatistics } from '../../../domain/ScoreResultTypes'
import type {
  AttackDisplayPresentation,
  AttackScoreDisplayPresentation,
} from '../model/AttackPresentationTypes'

export function getScoreStatisticsForCombo(
  presentation: AttackScoreDisplayPresentation | null,
  comboId: string | number,
): ScoreStatistics | null {
  if (
    presentation?.status !== 'ready'
    || !('combos' in presentation)
  ) {
    return null
  }
  const combo = presentation.combos.find((candidate) => candidate?.id === comboId)
  return combo?.scoreStatistics ?? null
}

export function findComboPresentation(
  presentation: AttackDisplayPresentation | null,
  comboId: string | number,
) {
  if (presentation === null) {
    return null
  }
  return presentation.combos.find((combo) => combo?.id === comboId) ?? null
}
