import { convolveDistributions } from '../core/probability/FFT'
import {
  createDistributionResult,
  DISTRIBUTION_RESULT_TOLERANCE,
} from './DistributionResult'
import {
  DAMAGE_AGGREGATION_ERROR_CODES,
  DAMAGE_AGGREGATION_NUMERICAL_EPSILON,
  DamageAggregationAbortError,
  checkAbort,
  fail,
  failNumerical,
} from './DamageAggregationCommon'
import { probabilityFromExplicitMass } from './DamageAggregationInspection'
import { createDamageAggregationMetadata } from './DamageAggregationMetadata'

const ABORT_CHECK_INTERVAL = 4_096

function allocateValues(length, details = {}) {
  try {
    return new Float64Array(length)
  } catch (error) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.RESOURCE_LIMIT,
      'unable to allocate damage aggregation values',
      { ...details, length, causeName: error?.name, causeMessage: error?.message }
    )
  }
}

function sanitizeConvolvedValues(values, signal) {
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    let value = values[index]
    if (!Number.isFinite(value)) {
      failNumerical('FFT convolution produced a non-finite probability', { index, value })
    }
    if (value < -DAMAGE_AGGREGATION_NUMERICAL_EPSILON) {
      failNumerical('FFT convolution produced a material negative probability', { index, value })
    }
    if (value < 0) {
      value = 0
    }
    if (value > 1 + DAMAGE_AGGREGATION_NUMERICAL_EPSILON) {
      failNumerical('FFT convolution produced a probability above one', { index, value })
    }
    if (value > 1) {
      value = 1
    }
    values[index] = value
    total += value
  }
  checkAbort(signal)
  if (!Number.isFinite(total)) {
    failNumerical('FFT convolution mass is not finite')
  }
  return total
}

function adjustMass(values, target, signal) {
  let total = 0
  let largestIndex = -1
  let largestValue = -1
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    total += values[index]
    if (values[index] > largestValue) {
      largestValue = values[index]
      largestIndex = index
    }
  }
  const difference = target - total
  if (Math.abs(difference) <= Number.EPSILON * Math.max(1, target)) {
    if (largestIndex >= 0) {
      values[largestIndex] += difference
    }
    return
  }

  let remaining = difference
  if (remaining > 0) {
    for (let index = 0; index < values.length && remaining > 0; index += 1) {
      const room = 1 - values[index]
      const delta = Math.min(room, remaining)
      values[index] += delta
      remaining -= delta
    }
  } else {
    remaining = -remaining
    for (let index = 0; index < values.length && remaining > 0; index += 1) {
      const delta = Math.min(values[index], remaining)
      values[index] -= delta
      remaining -= delta
    }
    remaining = -remaining
  }
  checkAbort(signal)
  if (Math.abs(remaining) > DISTRIBUTION_RESULT_TOLERANCE) {
    failNumerical(
      'explicit probability mass could not be safely normalized',
      { target, total, remaining }
    )
  }
}

function normalizeValuesToMass(values, target, rawMass, signal) {
  if (target < 0 || target > 1 || !Number.isFinite(target)) {
    failNumerical('target explicit probability mass is invalid', { target })
  }
  if (target === 0) {
    values.fill(0)
    return 0
  }
  if (values.length === 0 || rawMass <= 0 || !Number.isFinite(rawMass)) {
    failNumerical(
      'non-zero explicit mass is required for normalization',
      { target, rawMass, valuesLength: values.length }
    )
  }
  const factor = target / rawMass
  if (!Number.isFinite(factor)) {
    failNumerical('explicit probability normalization factor is not finite', {
      target,
      rawMass,
    })
  }
  for (let index = 0; index < values.length; index += 1) {
    if (index % ABORT_CHECK_INTERVAL === 0) {
      checkAbort(signal)
    }
    const value = values[index] * factor
    if (
      !Number.isFinite(value)
      || value < -DAMAGE_AGGREGATION_NUMERICAL_EPSILON
      || value > 1 + DAMAGE_AGGREGATION_NUMERICAL_EPSILON
    ) {
      failNumerical(
        'explicit probability normalization produced an unsafe value',
        { index, value, target, rawMass }
      )
    }
    values[index] = Math.min(1, Math.max(0, value))
  }
  adjustMass(values, target, signal)
  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

function overflowsEqual(left, right) {
  if (left === null || right === null) {
    return left === right
  }
  if (left.kind !== right.kind || left.lowerBound !== right.lowerBound) {
    return false
  }
  if (left.kind === 'exact') {
    return left.probability === right.probability
      && left.errorBound === right.errorBound
  }
  return left.probabilityUpperBound === right.probabilityUpperBound
    && left.errorBound === right.errorBound
}

function createOutputResult(values, plan, overflow, singleResult, signal) {
  if (singleResult !== null) {
    if (
      Object.isFrozen(singleResult)
      && Object.isFrozen(singleResult.support)
      && (
        singleResult.overflow === null
        || Object.isFrozen(singleResult.overflow)
      )
      && overflowsEqual(singleResult.overflow, overflow)
    ) {
      return singleResult
    }
    try {
      return createDistributionResult({
        values: singleResult.values,
        offset: plan.offset,
        support: plan.modeledSupport,
        overflow,
      })
    } catch (error) {
      fail(
        DAMAGE_AGGREGATION_ERROR_CODES.NUMERICAL_FAILURE,
        'single damage result could not be safely reused',
        { causeCode: error?.code, causeName: error?.name }
      )
    }
  }

  checkAbort(signal)
  try {
    return createDistributionResult({
      values,
      offset: plan.offset,
      support: plan.modeledSupport,
      overflow,
    })
  } catch (error) {
    const code = error?.code === 'index-overflow'
      ? DAMAGE_AGGREGATION_ERROR_CODES.INDEX_OVERFLOW
      : DAMAGE_AGGREGATION_ERROR_CODES.NUMERICAL_FAILURE
    fail(
      code,
      'aggregated damage result failed validation',
      { causeCode: error?.code, causeName: error?.name }
    )
  }
}

function getExecutionOptions(planRecord, normalizedOptions) {
  return Object.freeze({
    ...planRecord.normalizedOptions,
    signal: normalizedOptions.signal ?? planRecord.normalizedOptions.signal,
    onFftLength:
      normalizedOptions.onFftLength ?? planRecord.normalizedOptions.onFftLength,
    plan: null,
  })
}

function addFiniteNumbers(left, right, field) {
  const value = left + right
  if (!Number.isFinite(value)) {
    failNumerical(`${field} is not finite`, { left, right })
  }
  return value
}

/** Execute an approved private plan; no inspection or replanning occurs here. */
export function executeDamageAggregationPlan(planRecord, normalizedOptions) {
  const { inspected, plan } = planRecord
  const executionOptions = getExecutionOptions(planRecord, normalizedOptions)
  checkAbort(executionOptions.signal)

  if (inspected.length === 0) {
    const result = createDistributionResult({
      values: [1],
      offset: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    })
    const metadata = createDamageAggregationMetadata([], plan, {
      aggregationErrorBound: 0,
      rawExplicitMass: 1,
      explicitMass: 1,
      fftMassDrift: 0,
      sourceMassDrift: 0,
    })
    return Object.freeze({ result, metadata })
  }

  let values
  let singleResult = null
  if (inspected.length === 1) {
    singleResult = inspected[0].result
    values = inspected[0].values
  } else if (plan.hasEmptyValues) {
    values = allocateValues(0)
  } else {
    values = inspected[0].values
    for (const step of plan.steps) {
      checkAbort(executionOptions.signal)
      try {
        values = convolveDistributions(values, inspected[step.index].values, {
          fftLength: step.fftLength,
          signal: executionOptions.signal,
          onFftLength: executionOptions.onFftLength,
        })
      } catch (error) {
        if (
          executionOptions.signal?.aborted
          || error?.name === 'AbortError'
        ) {
          throw new DamageAggregationAbortError()
        }
        throw error
      }
      checkAbort(executionOptions.signal)
    }
  }

  let rawExplicitMass
  let explicitMass
  let fftMassDrift = 0
  let sourceMassDrift = 0
  let outputExactProbability = null
  if (singleResult !== null) {
    rawExplicitMass = inspected[0].explicitMass
    explicitMass = rawExplicitMass
  } else {
    rawExplicitMass = sanitizeConvolvedValues(values, executionOptions.signal)
    fftMassDrift = Math.abs(rawExplicitMass - plan.expectedExplicitMass)
    if (fftMassDrift > DISTRIBUTION_RESULT_TOLERANCE) {
      failNumerical(
        'FFT convolution mass drift exceeds the configured tolerance',
        {
          expectedExplicitMass: plan.expectedExplicitMass,
          rawExplicitMass,
          fftMassDrift,
          tolerance: DISTRIBUTION_RESULT_TOLERANCE,
        }
      )
    }

    if (plan.hasUpperBound) {
      if (rawExplicitMass > 1) {
        if (rawExplicitMass > 1 + DISTRIBUTION_RESULT_TOLERANCE) {
          failNumerical(
            'upper-bound aggregation explicit mass exceeds one',
            { rawExplicitMass }
          )
        }
        explicitMass = normalizeValuesToMass(
          values,
          1,
          rawExplicitMass,
          executionOptions.signal
        )
      } else {
        explicitMass = rawExplicitMass
      }
    }
  }

  if (!plan.hasUpperBound) {
    const targetExplicitMass = Math.max(0, 1 - plan.exactUnion)
    if (singleResult === null) {
      if (
        rawExplicitMass === 0
        && targetExplicitMass <= DISTRIBUTION_RESULT_TOLERANCE
      ) {
        values.fill(0)
        explicitMass = 0
      } else {
        explicitMass = normalizeValuesToMass(
          values,
          targetExplicitMass,
          rawExplicitMass,
          executionOptions.signal
        )
      }
    }
    outputExactProbability = probabilityFromExplicitMass(explicitMass)
    sourceMassDrift = Math.max(
      Math.abs(plan.expectedExplicitMass - targetExplicitMass),
      Math.abs(plan.exactUnion - outputExactProbability)
    )
  }

  const aggregationErrorBound = addFiniteNumbers(
    addFiniteNumbers(
      plan.sourceErrorBound,
      fftMassDrift,
      'aggregation error bound'
    ),
    sourceMassDrift,
    'aggregation error bound'
  )

  let outputOverflow
  if (plan.hasUpperBound) {
    const coverageUpperBound = Math.max(0, 1 - explicitMass)
    const probabilityUpperBound = Math.min(
      1,
      Math.max(plan.upperUnion, coverageUpperBound)
    )
    outputOverflow = {
      kind: 'upper-bound',
      lowerBound: plan.potentialOverflowLowerBound,
      probabilityUpperBound,
      errorBound: aggregationErrorBound,
    }
  } else if (plan.allOverflowNull) {
    outputOverflow = null
  } else {
    outputOverflow = {
      kind: 'exact',
      lowerBound: plan.potentialOverflowLowerBound,
      probability: outputExactProbability,
      errorBound: aggregationErrorBound,
    }
  }

  const result = createOutputResult(
    values,
    plan,
    outputOverflow,
    singleResult,
    executionOptions.signal
  )
  const metadata = createDamageAggregationMetadata(inspected, plan, {
    aggregationErrorBound,
    rawExplicitMass,
    explicitMass,
    fftMassDrift,
    sourceMassDrift,
  })
  checkAbort(executionOptions.signal)
  return Object.freeze({ result, metadata })
}
