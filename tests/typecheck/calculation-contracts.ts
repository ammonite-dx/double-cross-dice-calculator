import type {
  AttackCalculationOptions,
  CalculationClient,
  CheckCalculationOptions,
  BacktrackCalculationOptions,
  TotalDamageClientOptions,
} from '../../src/runtime/CalculationClientTypes'
import type {
  AttackCalculationRangePlan,
  CheckCalculationRangePlan,
  RangePolicyInput,
} from '../../src/calculation/planning/RangePlannerTypes'
import type { TotalDamageCalculationOptions } from '../../src/calculation/DamageAggregationTypes'

declare const client: CalculationClient

const policy: RangePolicyInput = {
  errorBudget: { scoreTail: 1e-9 },
  limits: { workingLength: 4096, maxCpuWork: 1_000_000 },
}

const checkOptions: CheckCalculationOptions = {
  rangePolicy: policy,
  onRangePlan: (plan: CheckCalculationRangePlan) => {
    plan.operation satisfies 'check'
    plan.scores[0].workingLength
  },
}

const attackOptions: AttackCalculationOptions = {
  onRangePlan: (plan) => {
    plan.operation satisfies 'attack'
    plan.damage.workingMax
  },
}

const backtrackOptions: BacktrackCalculationOptions = {
  onRangePlan: (plan) => {
    plan.operation satisfies 'backtrack'
    plan.backtrack.diceCounts.single
  },
}

const totalDamageOptions: TotalDamageClientOptions = {
  requestId: 'total-1',
  maxValuesLength: 4096,
  maxFftLength: 8192,
  maxResourceBytes: 1_000_000,
  maxComponents: 8,
  onFftLength: (length) => length,
}

void client
void checkOptions
void attackOptions
void backtrackOptions
void totalDamageOptions

// A callback for one operation cannot be silently reused for another.
const attackPlanCallback = (plan: AttackCalculationRangePlan) => {
  plan.damage.workingLength
}
const invalidCheckCallback: CheckCalculationOptions = {
  // @ts-expect-error: Check callbacks must receive a Check plan, not an Attack plan.
  onRangePlan: attackPlanCallback,
}

// Total Damage-only limits must not leak into planned operations.
// @ts-expect-error: Check must not accept Total Damage aggregation options.
const invalidCheckOptions: CheckCalculationOptions = { maxComponents: 8 }
// @ts-expect-error: Check must not accept Total Damage FFT options.
const invalidCheckFftOptions: CheckCalculationOptions = { maxFftLength: 1024 }
// @ts-expect-error: Attack must not accept Total Damage aggregation options.
const invalidAttackOptions: AttackCalculationOptions = { maxResourceBytes: 1024 }
// @ts-expect-error: Backtrack must not accept Total Damage aggregation options.
const invalidBacktrackOptions: BacktrackCalculationOptions = { maxComponents: 8 }

void invalidCheckCallback
void invalidCheckOptions
void invalidCheckFftOptions
void invalidAttackOptions
void invalidBacktrackOptions

// The retired production propagation selector is rejected at compile time.
// @ts-expect-error: scorePropagation is no longer a public production key.
const invalidPolicy: RangePolicyInput = { scorePropagation: 'invalid' }

// Migration-only resource policy keys are no longer part of the public type.
const invalidResourcePolicy: RangePolicyInput = {
  limits: {
    // @ts-expect-error: warning/hard threshold nesting is intentionally removed.
    warning: { workingLength: 4096 },
  },
}
const invalidCostModel: RangePolicyInput = {
  // @ts-expect-error: device-dependent cost models are intentionally removed.
  costModel: { dxOperationsPerMs: 1_000_000 },
}

// Unknown aggregation option names are rejected at compile time.
const invalidTotalDamageOptions: TotalDamageCalculationOptions = {
  // @ts-expect-error: typoed total-damage options must not silently pass through.
  maxValueLength: 10,
}

void invalidPolicy
void invalidResourcePolicy
void invalidCostModel
void invalidTotalDamageOptions
