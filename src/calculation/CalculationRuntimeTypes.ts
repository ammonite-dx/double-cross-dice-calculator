import type { DefenceDamageInput } from '../domain/CalculationInputs'
import type { ScorePair } from '../domain/ScoreResultTypes'
import type { DamageEnvelope } from '../domain/DamageResultTypes'
import type { AttackCalculationRangePlan } from './planning/RangePlannerTypes'
import type { NormalizedAttackDamageInput } from '../domain/CalculationInputNormalization'

/** Runtime context forwarded from the application into calculation cores. */
export interface CalculationRuntimeOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  readonly requestMetadata?: Readonly<Record<string, unknown>>
  readonly [key: string]: unknown
}

/** Options accepted by the runtime damage-roll calculation provider. */
export interface RuntimeDamageRollCalculateOptions extends CalculationRuntimeOptions {
  readonly fftLength?: number
  readonly distributionLength?: number
  readonly rawSupportMax?: number
}

/** Weight vectors accepted by the runtime damage-roll validator. */
export type RuntimeDamageRollWeights = readonly number[] | Float64Array

export interface DamageCalculationDependencies {
  readonly getDamageRollDistribution?: (
    weights: RuntimeDamageRollWeights,
    kazanari: number,
    options?: RuntimeDamageRollCalculateOptions,
  ) => Promise<Float64Array>
  readonly getD10Distribution?: (
    dice: number,
    size?: number,
    runtimeOptions?: CalculationRuntimeOptions,
  ) => Float64Array
  readonly onFftLength?: (fftLength: number) => void
}

export type CalculateDamageOnDemand = (
  score: ScorePair,
  attack: NormalizedAttackDamageInput,
  defence: DefenceDamageInput,
  dependencies: DamageCalculationDependencies,
  options: CalculationRuntimeOptions,
  rangePlan: AttackCalculationRangePlan,
) => Promise<DamageEnvelope>
