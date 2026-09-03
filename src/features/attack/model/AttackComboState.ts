import type {
  AttackCalculationInput,
  DamageInput,
  DefenceDamageInput,
  ReactionMode,
} from '../../../domain/CalculationInputs'
import type { ScoreInput } from '../../../domain/InputDomain'
import {
  createCanonicalComboDataState,
  snapshotCanonicalAttackParams,
} from '../../../application/AttackCanonicalState'

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
  canonicalScore: unknown
  canonicalScoreSummary: unknown
  canonicalScoreBatchSummary: unknown
  canonicalScorePresentation: unknown
  canonicalScoreReady: boolean
  canonicalDamage: unknown
  canonicalDamageSummary: unknown
  canonicalDamagePresentation: unknown
  canonicalRangePlan: unknown
  canonicalResultReady: boolean
}

export interface AttackCombo {
  id: number | string
  name: string
  show: boolean
  showDetails: {
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

function createShowDetails() {
  return {
    action: false,
    reaction: false,
  }
}

export function createCanonicalComboData(
  params: AttackComboParams = createAttackComboParams(),
): AttackComboData {
  return {
    params,
    ...createCanonicalComboDataState(),
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
    showDetails: createShowDetails(),
    data: createCanonicalComboData(),
  }
}

export function cloneAttackCombo(
  source: AttackCombo,
  id: number | string,
): AttackCombo {
  const params = snapshotCanonicalAttackParams(
    source.data.params
  ) as AttackComboParams
  return {
    id,
    name: `${source.name}のコピー`,
    show: true,
    showDetails: {
      action: source.showDetails.action,
      reaction: source.showDetails.reaction,
    },
    data: createCanonicalComboData(params),
  }
}
