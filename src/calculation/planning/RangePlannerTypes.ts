import type {
  AttackCalculationInput,
  DisplayRequestSnapshot,
}
  from '../../domain/CalculationInputs'
import type { BacktrackParams } from '../../domain/BacktrackRules'
import type { ScoreInput } from '../../domain/InputDomain'
import type { ScoreResolution } from '../../domain/ScoreResolution'

export interface RangeErrorBudget {
  readonly total: number
  readonly scoreTail: number
}

export interface RangeDisplayPolicy {
  readonly maxPoints: number
}

export interface RangeLimits {
  readonly maxCpuWork: number
  readonly estimatedMemoryBytes: number
  readonly workingLength: number
  readonly fftLength: number
}

/** Fully merged policy returned by the planner's policy helper. */
export interface RangePolicy {
  readonly errorBudget: RangeErrorBudget
  readonly display: RangeDisplayPolicy
  readonly limits: RangeLimits
}

/** Nested partial accepted by mergePolicy/create*RangePolicy boundaries. */
export type RangePolicyInput = Readonly<{
  readonly errorBudget?: Readonly<Partial<RangeErrorBudget>>
  readonly display?: Readonly<Partial<RangeDisplayPolicy>>
  readonly limits?: Readonly<Partial<RangeLimits>>
}>

/** Normalized display coordinates returned inside every calculation plan. */
export interface RangeDisplayPlan {
  readonly min: number
  readonly max: number
  readonly points: number
  readonly overflowLowerBound: number
}

export type RangePlanWarningSeverity = 'warning' | 'reject'

export interface RangePlanWarning {
  readonly code: string
  readonly severity: RangePlanWarningSeverity
  readonly message?: string
  readonly value?: unknown
  readonly limit?: unknown
}

/** Common resource estimate fields; operation-specific fields are optional. */
export interface RangePlanEstimates {
  readonly cpuWork: number
  readonly float64Bytes: number
  readonly scoreOperations?: number
  readonly scoreFftOperations?: number
  readonly damageOperations?: number
  readonly damageFftOperations?: number
  readonly defenceD10Operations?: number
  readonly defenceD10Float64Bytes?: number
  readonly totalDamageFftOperations?: number
  readonly backtrackOperations?: number
}

export interface ScoreSupportPlan {
  readonly kind: 'dx-tail' | 'finite-support'
  readonly finiteSupport: boolean
  readonly min: number
  readonly max: number
  readonly cutoff: number
}

export type ScoreTailModel =
  | 'exact-yousei'
  | 'exact-max'
  | 'exact-order-statistic'
  | 'conservative-union-bound'
  | 'finite-support'

export interface ScoreTailPlan {
  readonly model: ScoreTailModel
  readonly kind: 'dx-tail' | 'finite-support'
  readonly finiteSupport: boolean
  readonly requested: number
  readonly cutoff: number
  readonly bound: number
  readonly reachable: boolean
  readonly modeledMax: number
  readonly meaning: string
}

interface ScoreRangePlanBase {
  readonly display: RangeDisplayPlan
  readonly support: ScoreSupportPlan
  readonly tail: ScoreTailPlan
  readonly outputMax: number
  readonly operations: number
  readonly fftOperations: number
  readonly float64Bytes: number
  readonly finiteSupport: boolean
}

export interface RolledScoreRangePlan extends ScoreRangePlanBase {
  readonly kind: 'rolled-score'
  readonly params: ScoreInput
  readonly workingMax: number
  readonly workingLength: number
  readonly oneDieCutoff: number
  readonly fftLength: number
  readonly dxBlockLength: number
}

export interface FixedScoreRangePlan extends ScoreRangePlanBase {
  readonly kind: 'fixed-score'
  /** Fixed-score plans expose their sparse point coordinate. */
  readonly value: number
}

export interface ForcedFailureScoreRangePlan extends ScoreRangePlanBase {
  readonly kind: 'forced-failure'
}

export type ScoreRangePlan =
  | RolledScoreRangePlan
  | FixedScoreRangePlan
  | ForcedFailureScoreRangePlan

export interface DamageSupportPlan {
  readonly kind: 'finite-support'
  readonly finiteSupport: true
  readonly min: number
  readonly max: number
}

export interface DamageRangePlan {
  readonly dice: number
  readonly value: number
  readonly kazanari: number
  readonly attackDice: number
  readonly attackValue: number
  readonly defenceDice: number
  readonly defenceValue: number
  readonly fixedDifference: number
  readonly maxDamageDice: number
  readonly effectiveKazanari: number
  readonly support: DamageSupportPlan
  readonly rawSupportMax: number
  readonly rawMax: number
  readonly workingMax: number
  readonly workingLength: number
  readonly defenceMax: number
  readonly fftLength: number
  readonly defenceFftLength: number
  readonly operations: number
  readonly damageOperations: number
  readonly fftOperations: number
  readonly float64Bytes: number
  readonly defenceD10Length: number
  readonly defenceD10Operations: number
  readonly defenceD10Float64Bytes: number
  readonly finiteSupport: true
  readonly scoreValueUpperBound: number
  readonly display: RangeDisplayPlan
}

export interface BacktrackSupportPlan {
  readonly kind: 'finite-support'
  readonly finiteSupport: true
  readonly min: number
  readonly max: number
}

export interface BacktrackDiceCounts {
  readonly single: number
  readonly double: number
  readonly second: number
}

export interface BacktrackRangePlan {
  readonly params: BacktrackParams
  readonly display: RangeDisplayPlan
  readonly rule: string
  readonly diceModifier: number
  readonly livingdead: boolean
  readonly diceCounts: BacktrackDiceCounts
  readonly maxDice: number
  readonly support: BacktrackSupportPlan
  readonly rawSupportMax: number
  readonly workingMax: number
  readonly workingLength: number
  readonly fftLength: 0
  readonly generationOperations: number
  readonly operations: number
  readonly float64Bytes: number
  readonly baseFloat64Bytes: number
  readonly resultFloat64Bytes: number
  readonly finiteSupport: true
  readonly generationMode: 'on-demand'
}

export interface RangeOverflowInfo {
  readonly type: string
  readonly finiteSupport: boolean
  readonly lowerBound: number | null
  readonly bound: number | null
  readonly meaning: string
}

export interface RangeOverflowInfoSet {
  readonly score: RangeOverflowInfo | null
  readonly damage: RangeOverflowInfo | null
  readonly display: RangeOverflowInfo
  readonly backtrack: RangeOverflowInfo | null
}

export interface CalculationRangePlanBase {
  readonly accepted: boolean
  readonly display: RangeDisplayPlan
  readonly estimates: RangePlanEstimates
  readonly errorBudget: {
    readonly total: number
    readonly scoreTail: number
    readonly scorePerSide: number
    readonly finiteDamageTail: number
  }
  readonly overflow: {
    readonly score: string
    readonly damage: string
    readonly totalDamage: string
    readonly backtrack: string
  }
  readonly overflowInfo: RangeOverflowInfoSet
  readonly warnings: readonly RangePlanWarning[]
  readonly rejectionReasons?: readonly string[]
}

export interface ScoreCalculationRangePlan extends CalculationRangePlanBase {
  readonly operation: 'score'
  readonly scores: readonly [ScoreRangePlan]
  readonly damage: null
  readonly backtrack: null
}

export interface CheckCalculationRangePlan extends CalculationRangePlanBase {
  readonly operation: 'check'
  readonly scores: readonly [ScoreRangePlan, ScoreRangePlan]
  readonly damage: null
  readonly backtrack: null
}

export interface AttackCalculationRangePlan extends CalculationRangePlanBase {
  readonly operation: 'attack'
  readonly scores: readonly [ScoreRangePlan, ScoreRangePlan]
  readonly damage: DamageRangePlan
  readonly backtrack: null
}

export interface BacktrackCalculationRangePlan extends CalculationRangePlanBase {
  readonly operation: 'backtrack'
  readonly scores: readonly []
  readonly damage: null
  readonly backtrack: BacktrackRangePlan
}

export type CalculationRangePlan =
  | ScoreCalculationRangePlan
  | CheckCalculationRangePlan
  | AttackCalculationRangePlan
  | BacktrackCalculationRangePlan

export type CalculationRangePlanOperation = CalculationRangePlan['operation']

type RangePlannerDisplayInput = Partial<
  Pick<DisplayRequestSnapshot, 'min' | 'max'>
>

interface RangePlannerInputBase {
  readonly display?: RangePlannerDisplayInput
}

export interface ScoreRangePlannerInput extends RangePlannerInputBase {
  readonly operation: 'score'
  readonly score: ScoreInput | ScoreResolution
}

export interface CheckRangePlannerInput extends RangePlannerInputBase {
  readonly operation: 'check'
  readonly score: {
    readonly action: ScoreInput | ScoreResolution
    readonly reaction: ScoreInput | ScoreResolution
  }
}

export interface AttackRangePlannerInput extends RangePlannerInputBase {
  readonly operation: 'attack'
  readonly score: {
    readonly action: ScoreInput | ScoreResolution
    readonly reaction: ScoreInput | ScoreResolution
  }
  readonly attack: AttackCalculationInput['action']['damage']
  readonly defence: AttackCalculationInput['reaction']['damage']
  readonly comboCount?: number
}

export interface BacktrackRangePlannerInput extends RangePlannerInputBase {
  readonly operation: 'backtrack'
  readonly backtrack: BacktrackParams
}

/** Operation-specific inputs accepted by the public planner façade. */
export type RangePlannerParams =
  | ScoreRangePlannerInput
  | CheckRangePlannerInput
  | AttackRangePlannerInput
  | BacktrackRangePlannerInput
