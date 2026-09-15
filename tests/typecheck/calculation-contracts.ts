import type {
  AttackCalculationOptions,
  CalculationClient,
  CheckCalculationOptions,
} from '../../src/runtime/CalculationClientTypes'
import type {
  CalculationRangePlan,
  RangePolicyInput,
} from '../../src/calculation/planning/RangePlannerTypes'
import type { TotalDamageCalculationOptions } from '../../src/calculation/DamageAggregationTypes'

declare const client: CalculationClient

function usePlan(plan: CalculationRangePlan) {
  if (plan.operation === 'attack') {
    plan.damage.workingMax
    plan.backtrack
  }
  if (plan.operation === 'backtrack') {
    plan.backtrack.diceCounts.single
    plan.scores
  }
  if (plan.operation === 'check') {
    plan.scores[0].tail.bound
  }
}

const policy: RangePolicyInput = {
  scorePropagation: 'full-tail',
  errorBudget: { scoreTail: 1e-9 },
  limits: { warning: { workingLength: 4096 } },
  costModel: { dxOperationsPerMs: 1_000_000 },
}

const checkOptions: CheckCalculationOptions = {
  rangePolicy: policy,
  onRangePlan: usePlan,
}

const attackOptions: AttackCalculationOptions = {
  displayRequest: { min: 0, max: 20, mode: 'pmf' },
  scoreDisplayRequest: { min: 0, max: 20, mode: 'upper-tail' },
}

const totalDamageOptions: TotalDamageCalculationOptions = {
  maxValuesLength: 4096,
  maxFftLength: 8192,
  maxResourceBytes: 1_000_000,
  maxComponents: 8,
  onFftLength: (length) => length,
}

void client
void checkOptions
void attackOptions
void totalDamageOptions

// Invalid propagation values are rejected at compile time.
// @ts-expect-error: scorePropagation accepts only the two supported modes.
const invalidPolicy: RangePolicyInput = { scorePropagation: 'invalid' }

// Unknown aggregation option names are rejected at compile time.
const invalidTotalDamageOptions: TotalDamageCalculationOptions = {
  // @ts-expect-error: typoed total-damage options must not silently pass through.
  maxValueLength: 10,
}

void invalidPolicy
void invalidTotalDamageOptions
