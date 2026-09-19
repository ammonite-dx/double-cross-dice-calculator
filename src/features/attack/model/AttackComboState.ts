import type {
  AttackCalculationInput,
  DamageInput,
  DefenceDamageInput,
  ReactionMode,
} from '../../../domain/CalculationInputs'
import type { ScoreInput } from '../../../domain/InputDomain'
import {
  createComboDataState,
  snapshotAttackParams,
} from './AttackState'
import type { AttackCalculationRecord } from './AttackCalculationRecord'
import {
  applyAttackAdvancedSettingsPolicy,
  createAttackAdvancedSettingsEnabled,
} from './AttackAdvancedSettings'

export type AttackComboSide = 'action' | 'reaction'

export interface AttackComboParams extends AttackCalculationInput {
  action: {
    score: ScoreInput
    damage: DamageInput & { kazanari: number }
  }
  reaction: {
    mode: ReactionMode
    score: ScoreInput
    damage: DefenceDamageInput
  }
}

export interface AttackComboData {
  params: AttackComboParams
  calculation: AttackCalculationRecord | null
}

export interface AttackCombo {
  id: number | string
  name: string
  show: boolean
  advancedSettingsEnabled: {
    action: boolean
    reaction: boolean
  }
  data: AttackComboData
}

function createScoreParams(): ScoreInput {
  return {
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
  }
}

function createActionParams(): AttackComboParams['action'] {
  return {
    score: createScoreParams(),
    damage: {
      dice: 0,
      value: 0,
      kazanari: 0,
    },
  }
}

function createReactionParams(): AttackComboParams['reaction'] {
  return {
    mode: 'ドッジ',
    score: createScoreParams(),
    damage: {
      dice: 0,
      value: 0,
    },
  }
}

export function createAttackComboParams(): AttackComboParams {
  return {
    action: createActionParams(),
    reaction: createReactionParams(),
  }
}

export function createComboData(
  params: AttackComboParams = createAttackComboParams(),
): AttackComboData {
  return {
    params,
    ...createComboDataState(),
  }
}

export function createAttackCombo(
  id: number | string,
  name = `コンボ${Number(id) + 1}`,
): AttackCombo {
  return {
    id,
    name,
    show: true,
    advancedSettingsEnabled: createAttackAdvancedSettingsEnabled(),
    data: createComboData(),
  }
}

export function cloneAttackCombo(
  source: AttackCombo,
  id: number | string,
): AttackCombo {
  const snapshot = snapshotAttackParams(source.data.params) as AttackComboParams
  const params = {
    ...snapshot,
    action: applyAttackAdvancedSettingsPolicy(
      'action',
      snapshot.action,
      source.advancedSettingsEnabled.action
    ),
    reaction: applyAttackAdvancedSettingsPolicy(
      'reaction',
      snapshot.reaction,
      source.advancedSettingsEnabled.reaction
    ),
  }
  return {
    id,
    name: `${source.name}のコピー`,
    show: true,
    advancedSettingsEnabled: {
      action: source.advancedSettingsEnabled.action,
      reaction: source.advancedSettingsEnabled.reaction,
    },
    data: createComboData(params),
  }
}
