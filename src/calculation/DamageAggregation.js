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
  hasOwn,
  isDamageAggregationAbortError,
  isDamageAggregationError,
  isRecord,
  normalizeOptions,
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
import {
  getDamageAggregationPlanRecord,
  registerDamageAggregationPlan,
} from './DamageAggregationPlanStore'
import { executeDamageAggregationPlan } from './DamageAggregationExecutor'

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

/** @typedef {import('./DamageAggregationTypes').TotalDamageCalculationOptions} TotalDamageCalculationOptions */
/** @typedef {import('./DamageAggregationTypes').DamageAggregationPlan} DamageAggregationPlan */

function createPlanContract(Damages, inspected, plan, normalizedOptions) {
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
    componentCount: Damages.length,
    outputLength: plan.outputLength,
    offset: plan.offset,
    modeledSupport: copySupport(plan.modeledSupport),
    sourceSupport: copySupport(plan.sourceSupport),
    steps,
    estimates,
  })

  return registerDamageAggregationPlan(publicPlan, {
    Damages,
    inspected,
    plan,
    normalizedOptions,
  })
}

function createDamagePlan(Damages, normalizedOptions) {
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
    return createPlanContract(
      Damages,
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
      normalizedOptions
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
  return createPlanContract(
    Damages,
    ownedInspected,
    plan,
    normalizedOptions
  )
}

function getPlanRecord(plan) {
  return getDamageAggregationPlanRecord(plan)
}

function assertPlanMatchesInput(planRecord, Damages) {
  if (planRecord.Damages !== Damages) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'damage aggregation plan does not match the input snapshot'
    )
  }
}

function assertPlanLimitsMatch(planRecord, options) {
  for (const name of [
    'maxValuesLength',
    'maxFftLength',
    'maxResourceBytes',
    'maxComponents',
  ]) {
    if (
      hasOwn(options, name)
      && options[name] !== planRecord.normalizedOptions[name]
    ) {
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
        `damage aggregation plan does not match ${name}`,
        { name, planned: planRecord.normalizedOptions[name], value: options[name] }
      )
    }
  }
}

/** Validate aggregation options without inspecting or planning envelopes. */
export function validateDamageAggregationOptions(options = {}) {
  return normalizeOptions(options)
}

/** Validate and plan an independent damage sum without allocating FFT buffers. */
/**
 * @param {readonly import('../domain/DistributionResultTypes').DistributionEnvelope[]} Damages
 * @param {TotalDamageCalculationOptions} [options]
 * @returns {DamageAggregationPlan}
 */
export function planDamageAggregation(Damages, options = {}) {
  const normalizedOptions = normalizeOptions(options)
  return createDamagePlan(Damages, normalizedOptions)
}

/**
 * Execute a damage sum. When a plan is supplied, no envelope validation or
 * resource planning is repeated: the approved immutable plan is executed.
 */
/**
 * @param {readonly import('../domain/DistributionResultTypes').DistributionEnvelope[]} Damages
 * @param {TotalDamageCalculationOptions & { plan?: DamageAggregationPlan }} [options]
 * @param {DamageAggregationPlan} [explicitPlan]
 * @returns {import('../domain/DistributionResultTypes').DistributionEnvelope}
 */
export function sumDamage(Damages, options = {}, explicitPlan = undefined) {
  let rawOptions = options
  if (explicitPlan !== undefined) {
    if (!isRecord(options)) {
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
        'damage aggregation options must be an object'
      )
    }
    rawOptions = { ...options, plan: explicitPlan }
  }

  const normalizedOptions = normalizeOptions(rawOptions, true)
  let planRecord
  if (normalizedOptions.plan === null) {
    const publicPlan = createDamagePlan(Damages, normalizedOptions)
    planRecord = getPlanRecord(publicPlan)
  } else {
    planRecord = getPlanRecord(normalizedOptions.plan)
    assertPlanMatchesInput(planRecord, Damages)
    assertPlanLimitsMatch(planRecord, rawOptions)
    checkAbort(normalizedOptions.signal)
  }

  return executeDamageAggregationPlan(planRecord, normalizedOptions)
}
