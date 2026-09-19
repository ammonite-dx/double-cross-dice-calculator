import type { ScoreInput } from '../../../domain/CalculationInputs'

export type CheckScoreSide = 'action' | 'reaction'

export interface CheckAdvancedSettingsEnabled {
  action: boolean
  reaction: boolean
}

export interface CheckAdvancedSettingsChange {
  side: CheckScoreSide
  enabled: boolean
}

export function createCheckAdvancedSettingsEnabled(): CheckAdvancedSettingsEnabled {
  return {
    action: false,
    reaction: false,
  }
}

/**
 * Advanced score effects are feature state, not merely form decoration.
 * Keep the canonical snapshot consistent even when a caller bypasses Vue.
 */
export function applyCheckAdvancedSettingsPolicy(
  params: Partial<ScoreInput>,
  enabled: boolean,
): Partial<ScoreInput> {
  const snapshot = { ...params }
  if (enabled) {
    return snapshot
  }
  return {
    ...snapshot,
    yousei: 0,
    shihai: 0,
  }
}

export function hasCheckAdvancedSettingsValue(
  params: Partial<ScoreInput>,
): boolean {
  return (params.yousei ?? 0) !== 0 || (params.shihai ?? 0) !== 0
}
