import type { AttackComboParams, AttackComboSide } from './AttackComboState'
import {
  createAttackInputSnapshot,
  createDefenceInputSnapshot,
} from './AttackInputSnapshot'

export interface AttackAdvancedSettingsEnabled {
  action: boolean
  reaction: boolean
}

export interface AttackAdvancedSettingsChange {
  id: number | string
  side: AttackComboSide
  enabled: boolean
}

export function createAttackAdvancedSettingsEnabled(): AttackAdvancedSettingsEnabled {
  return {
    action: false,
    reaction: false,
  }
}

export function applyAttackAdvancedSettingsPolicy(
  side: 'action',
  snapshot: AttackComboParams['action'],
  enabled: boolean,
): AttackComboParams['action']
export function applyAttackAdvancedSettingsPolicy(
  side: 'reaction',
  snapshot: AttackComboParams['reaction'],
  enabled: boolean,
): AttackComboParams['reaction']
export function applyAttackAdvancedSettingsPolicy(
  side: AttackComboSide,
  snapshot: AttackComboParams['action'] | AttackComboParams['reaction'],
  enabled: boolean,
) {
  if (side === 'action') {
    const next = createAttackInputSnapshot(snapshot) as AttackComboParams['action']
    if (!enabled) {
      next.score.yousei = 0
      next.score.shihai = 0
      next.damage.kazanari = 0
    }
    return next
  }

  const next = createDefenceInputSnapshot(snapshot) as AttackComboParams['reaction']
  if (!enabled) {
    next.score.yousei = 0
    next.score.shihai = 0
  }
  return next
}

export function hasAttackAdvancedSettingsValue(
  side: 'action',
  snapshot: AttackComboParams['action'],
): boolean
export function hasAttackAdvancedSettingsValue(
  side: 'reaction',
  snapshot: AttackComboParams['reaction'],
): boolean
export function hasAttackAdvancedSettingsValue(
  side: AttackComboSide,
  snapshot: AttackComboParams['action'] | AttackComboParams['reaction'],
): boolean {
  if (side === 'action') {
    const action = snapshot as AttackComboParams['action']
    return (action.score.yousei ?? 0) !== 0
      || (action.score.shihai ?? 0) !== 0
      || (action.damage.kazanari ?? 0) !== 0
  }
  const reaction = snapshot as AttackComboParams['reaction']
  return (reaction.score.yousei ?? 0) !== 0
    || (reaction.score.shihai ?? 0) !== 0
}
