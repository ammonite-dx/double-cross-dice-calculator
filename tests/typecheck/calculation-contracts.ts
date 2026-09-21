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
import type {
  AggregatedDamageEnvelope,
  DamageAggregationPlan,
  PreparedDamageAggregation,
  DamageAggregationExecutionOptions,
  TotalDamageCalculationOptions,
} from '../../src/calculation/DamageAggregationTypes'
import type {
  BacktrackDistributionGenerationRequest,
  ValidatedBacktrackExecutionPlan,
} from '../../src/calculation/BacktrackCalculationTypes'
import {
  createCalculationClient,
  createCalculationDependencies,
} from '../../src/runtime/CalculationClient'
import type {
  CalculationClientDependencyOverrides,
} from '../../src/runtime/CalculationClientDependencyTypes'

declare const client: CalculationClient

const policy: RangePolicyInput = {
  errorBudget: { scoreTail: 1e-9 },
  limits: { workingLength: 4096, maxCpuWork: 1_000_000 },
}

const checkOptions: CheckCalculationOptions = {
  rangePolicy: policy,
  onRangePlan: (plan: CheckCalculationRangePlan) => {
    plan.operation satisfies 'check'
    const score = plan.scores[0]
    if (score.kind === 'rolled-score') {
      score.workingLength
    }
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

declare const aggregatePlan: DamageAggregationPlan
aggregatePlan.steps.forEach((step) => {
  step.resultLength
  // @ts-expect-error: runtime step operations belong to plan.estimates.
  step.operations
})

declare const preparedAggregation: PreparedDamageAggregation
preparedAggregation.plan.estimates.float64Bytes
preparedAggregation.execute()
const executionOptions: DamageAggregationExecutionOptions = {
  signal: new AbortController().signal,
  onFftLength: (length) => length,
}
preparedAggregation.execute(executionOptions)
// @ts-expect-error: resource limits belong to preparation, not execution.
preparedAggregation.execute({ maxFftLength: 1024 })
// @ts-expect-error: the public plan is metadata and has no execution method.
preparedAggregation.plan.execute()

declare const aggregateEnvelope: AggregatedDamageEnvelope
aggregateEnvelope.metadata.componentDescriptors[0]?.sourceSupport

const generationRequest: BacktrackDistributionGenerationRequest = {
  diceCounts: [0, 1, 2],
  size: 21,
  livingdead: true,
}
const validatedBacktrackPlan: ValidatedBacktrackExecutionPlan = {
  normalizedParams: {
    encroachment: 100,
    lois: 1,
    elois: 0,
    dice: 0,
    value: 0,
    dlois: 'なし',
  },
  diceCounts: generationRequest.diceCounts,
}
void validatedBacktrackPlan

// R27-B2b runtime/public-contract regressions.
const concreteClient: CalculationClient = createCalculationClient()
const completeDependencies = createCalculationDependencies()
const rawCheckParams = {
  action: { dice: 1, critical: 10, skill: 0 },
  reaction: { dice: 1, critical: 10, skill: 0 },
}

void concreteClient.calculateCheck(rawCheckParams, undefined)
void concreteClient.calculateCheck(rawCheckParams, { opposed: true })
// @ts-expect-error: difficulty opposed must be boolean.
void concreteClient.calculateCheck(rawCheckParams, { opposed: 'false' })

void concreteClient.planBacktrack({ lois: 2, dlois: '屍人' })
void concreteClient.calculateBacktrack({ lois: 2 })

const concreteCheckPlan = concreteClient.planCheck(rawCheckParams)
concreteCheckPlan.operation satisfies 'check'
const concreteAttackPlan = concreteClient.planAttackCombo({
  action: {
    score: { dice: 1, critical: 10, skill: 0 },
    damage: { dice: 0, value: 0 },
  },
  reaction: {
    mode: 'ドッジ',
    score: { dice: 1, critical: 10, skill: 0 },
    damage: { dice: 0, value: 0 },
  },
})
concreteAttackPlan.operation satisfies 'attack'

const dependencyOverrides: CalculationClientDependencyOverrides = {
  calculateDxDistribution: (input, options) => {
    input.dice
    options?.workingLength
    return new Float64Array([1])
  },
}
const overriddenClient: CalculationClient = createCalculationClient(
  dependencyOverrides,
)
void overriddenClient
void completeDependencies

const invalidDependencyOverrides: CalculationClientDependencyOverrides = {
  // @ts-expect-error: score dependency must return a score envelope.
  calculateScore: () => 1,
}
void invalidDependencyOverrides
