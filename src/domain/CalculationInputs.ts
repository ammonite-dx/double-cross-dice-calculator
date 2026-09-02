import type { BacktrackParams } from './BacktrackRules'
import type { ScoreInput } from './InputDomain'

export type { BacktrackParams, ScoreInput }

export interface DifficultyInput {
  opposed: boolean
  target: number
}

export interface DamageInput {
  dice: number
  value: number
  kazanari?: number
}

export interface DefenceDamageInput {
  dice: number
  value: number
}

export interface AttackInputSnapshot {
  score: Partial<ScoreInput>
  damage: DamageInput
}

export type ReactionMode =
  | 'ドッジ'
  | '《イベイション》'
  | 'ガード・リアクション放棄'

export interface DefenceInputSnapshot {
  mode: ReactionMode
  score: Partial<ScoreInput>
  damage: DefenceDamageInput
}

export interface CheckInputSnapshot {
  difficulty: Partial<DifficultyInput>
  params: {
    action: Partial<ScoreInput>
    reaction: Partial<ScoreInput>
  }
}

export interface AttackCalculationInput {
  action: AttackInputSnapshot
  reaction: DefenceInputSnapshot
}

export interface BacktrackInputSnapshot {
  params: Partial<BacktrackParams>
}

export type DisplayMode = 'pmf' | 'upper-tail'

export interface DisplayRequestSnapshot {
  min: number
  max: number
  mode: DisplayMode
}

export interface AttackBatchEntry {
  id: string | number
  params: AttackCalculationInput
}
