import {
  DAMAGE_AGGREGATION_ERROR_CODES,
  DAMAGE_AGGREGATION_LIMITS,
  DAMAGE_AGGREGATION_MAX_COMPONENTS,
  DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
  DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES,
  DAMAGE_AGGREGATION_MAX_VALUES_LENGTH,
  DAMAGE_AGGREGATION_NUMERICAL_EPSILON,
  DamageAggregationAbortError,
  DamageAggregationError,
  checkAbort,
  fail,
  failResource,
  isDamageAggregationAbortError,
  isDamageAggregationError,
  normalizeOptions,
  normalizeExecutionOptions,
  DAMAGE_AGGREGATION_PLAN_VERSION,
} from './DamageAggregationCommon'
import {
  copySupport,
  inspectEnvelope,
  snapshotInspectedComponents,
} from './DamageAggregationInspection'
import {
  buildDamageAggregationPlan,
  ensureLengthLimit,
  estimateAggregateOutputLength,
  estimatePersistentBytes,
  getSourceValuesLength,
} from './DamageAggregationPlanner'
import { executePreparedDamageAggregation } from './DamageAggregationExecutor'
import type {
  DamageAggregationExecutionOptions,
  DamageAggregationInput,
  DamageAggregationInternalPlan,
  DamageAggregationPlan,
  InspectedDamageComponent,
  PreparedDamageAggregation,
  PreparedDamageAggregationState,
  TotalDamageCalculationOptions,
} from './DamageAggregationTypes'
import type { DistributionEnvelope } from '../domain/DistributionResultTypes'

export {
  DAMAGE_AGGREGATION_ERROR_CODES,
  DAMAGE_AGGREGATION_LIMITS,
  DAMAGE_AGGREGATION_MAX_COMPONENTS,
  DAMAGE_AGGREGATION_MAX_FFT_LENGTH,
  DAMAGE_AGGREGATION_MAX_RESOURCE_BYTES,
  DAMAGE_AGGREGATION_MAX_VALUES_LENGTH,
  DAMAGE_AGGREGATION_NUMERICAL_EPSILON,
  DamageAggregationAbortError,
  DamageAggregationError,
  isDamageAggregationAbortError,
  isDamageAggregationError,
}

interface NormalizedAggregationOptions {
  readonly maxValuesLength: number
  readonly maxFftLength: number
  readonly maxResourceBytes: number
  readonly maxComponents: number
  readonly signal: AbortSignal | null
  readonly onFftLength?: (fftLength: number) => void
}

interface NormalizedExecutionOptions {
  readonly signal: AbortSignal | null
  readonly onFftLength?: (fftLength: number) => void
}

type InternalAggregationPlan = DamageAggregationInternalPlan & {
  readonly steps: readonly DamageAggregationInternalPlan['steps'][number][]
}

function createPlanContract(
  componentCount: number,
  plan: InternalAggregationPlan,
): DamageAggregationPlan {
  const steps = Object.freeze(plan.steps.map((step) => Object.freeze({ ...step })))
  const estimates = Object.freeze({
    float64Bytes: plan.peakResourceBytes,
    operations: plan.operations,
    cpuWork: plan.cpuWork,
    persistentBytes: plan.persistentBytes,
    peakResourceBytes: plan.peakResourceBytes,
    fftLengths: Object.freeze(steps.map((step) => step.fftLength)),
  })
  const publicPlan = Object.freeze({
    version: DAMAGE_AGGREGATION_PLAN_VERSION,
    operation: 'damage-aggregation',
    componentCount,
    outputLength: plan.outputLength,
    offset: plan.offset,
    modeledSupport: copySupport(plan.modeledSupport),
    sourceSupport: copySupport(plan.sourceSupport),
    steps,
    estimates,
  })

  return publicPlan
}

function createPreparedDamageAggregation(
  componentCount: number,
  inspected: readonly InspectedDamageComponent[],
  plan: InternalAggregationPlan,
  normalizedOptions: NormalizedAggregationOptions,
): PreparedDamageAggregation {
  const publicPlan = createPlanContract(componentCount, plan)
  const preparedState: PreparedDamageAggregationState = Object.freeze({
    inspected: Object.freeze([...inspected]),
    plan,
    executionDefaults: Object.freeze({
      signal: normalizedOptions.signal,
      onFftLength: normalizedOptions.onFftLength,
    }),
  })

  return Object.freeze({
    plan: publicPlan,
    execute(options: DamageAggregationExecutionOptions = {}) {
      const normalizedOptions = normalizeExecutionOptions(options) as NormalizedExecutionOptions
      return executePreparedDamageAggregation(preparedState, normalizedOptions)
    },
  })
}

function createDamagePlan(
  Damages: DamageAggregationInput,
  normalizedOptions: NormalizedAggregationOptions,
): PreparedDamageAggregation {
  checkAbort(normalizedOptions.signal)

  if (!Array.isArray(Damages)) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_ENVELOPE,
      'Damages must be an array of damage envelopes'
    )
  }
  if (Damages.length > normalizedOptions.maxComponents) {
    failResource(
      'damage component count exceeds the configured resource limit',
      {
        componentCount: Damages.length,
        limit: normalizedOptions.maxComponents,
      }
    )
  }

  // Reserve fixed plan overhead before inspecting caller-owned envelopes.
  let persistentBytes = estimatePersistentBytes(Damages.length, 1)
  if (persistentBytes > normalizedOptions.maxResourceBytes) {
    failResource(
      'persistent damage aggregation resources exceed the configured resource limit',
      {
        componentCount: Damages.length,
        persistentBytes,
        limit: normalizedOptions.maxResourceBytes,
      }
    )
  }

  if (Damages.length === 0) {
    if (normalizedOptions.maxValuesLength < 1) {
      failResource(
        'zero-component identity exceeds the configured values length limit',
        { length: 1, limit: normalizedOptions.maxValuesLength }
      )
    }
    return createPreparedDamageAggregation(
      Damages.length,
      [],
      {
        offset: 0,
        modeledSupport: Object.freeze({ kind: 'finite', max: 0 }),
        sourceSupport: Object.freeze({ kind: 'finite', max: 0 }),
        exactUnion: 0,
        upperUnion: 0,
        hasUpperBound: false,
        expectedExplicitMass: 1,
        allOverflowNull: true,
        sourceErrorBound: 0,
        potentialOverflowLowerBound: 0,
        hasEmptyValues: false,
        outputLength: 1,
        persistentBytes,
        peakResourceBytes: persistentBytes,
        operations: 0,
        cpuWork: 0,
        steps: [],
      },
      normalizedOptions,
    )
  }

  const inspected = Damages.map((envelope, index) =>
    inspectEnvelope(envelope, index, normalizedOptions.signal)
  )
  for (const component of inspected) {
    ensureLengthLimit(
      component.values.length,
      normalizedOptions,
      'component values length',
      component.index
    )
  }

  const outputLength = estimateAggregateOutputLength(inspected, normalizedOptions)
  persistentBytes = estimatePersistentBytes(
    Damages.length,
    outputLength,
    getSourceValuesLength(inspected)
  )
  if (persistentBytes > normalizedOptions.maxResourceBytes) {
    failResource(
      'persistent damage aggregation resources exceed the configured resource limit',
      {
        componentCount: Damages.length,
        outputLength,
        persistentBytes,
        limit: normalizedOptions.maxResourceBytes,
      }
    )
  }

  // Own coefficient arrays before publishing the plan. This snapshot is the
  // only source used while a caller waits for ResourceGuard admission.
  const ownedInspected = snapshotInspectedComponents(
    inspected,
    normalizedOptions.signal
  )
  const plan = buildDamageAggregationPlan(
    ownedInspected,
    normalizedOptions,
    persistentBytes
  )
  checkAbort(normalizedOptions.signal)
  return createPreparedDamageAggregation(
    Damages.length,
    ownedInspected,
    plan as InternalAggregationPlan,
    normalizedOptions,
  )
}

/** Validate aggregation options without inspecting or planning envelopes. */
export function validateDamageAggregationOptions(options = {}) {
  return normalizeOptions(options)
}

/** Validate and prepare an independent damage sum without allocating FFT buffers. */
export function prepareDamageAggregation(
  Damages: readonly DistributionEnvelope[],
  options: TotalDamageCalculationOptions = {},
): PreparedDamageAggregation {
  const normalizedOptions = normalizeOptions(options) as NormalizedAggregationOptions
  return createDamagePlan(Damages, normalizedOptions)
}

/** Execute a one-shot damage sum by preparing and immediately executing it. */
export function sumDamage(
  Damages: readonly DistributionEnvelope[],
  options: TotalDamageCalculationOptions = {},
) {
  if (arguments.length > 2) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'sumDamage accepts only damages and one-shot options'
    )
  }
  return prepareDamageAggregation(Damages, options).execute()
}
