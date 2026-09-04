import {
  getExpectedValueSummary,
  getProbabilityMassSummary,
} from '../../../calculation/DistributionResult'
import {
  CHART_SERIES_NOT_PROJECTABLE_REASONS,
  CHART_SERIES_NOT_READY_REASONS,
  DISPLAY_PROBABILITY_TOLERANCE,
  DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH,
  DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
  createChartSeries,
  materializeChartJsData,
  planDisplayRange,
  presentDistribution,
} from '../../../shared/presentation'
import {
  ATTACK_DISPLAY_MODES,
  createAttackDisplayRequestSnapshot,
  DEFAULT_ATTACK_DISPLAY_REQUEST,
} from './AttackDisplayRequestSnapshot'

export const ATTACK_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_BATCH_RESULT: 'invalid-batch-result',
  INVALID_BATCH_SUMMARY: 'invalid-batch-summary',
  INVALID_CLONE: 'invalid-clone',
  INVALID_COMBO: 'invalid-combo',
  INVALID_DISPLAY_OPTIONS: 'invalid-display-options',
  INVALID_RANGE_PLAN: 'invalid-range-plan',
  INVALID_RANGE_PLANS: 'invalid-range-plans',
  RANGE_PLAN_COUNT_MISMATCH: 'range-plan-count-mismatch',
  UNSAFE_CLONE: 'unsafe-clone',
})

export const ATTACK_DISPLAY_PRESENTATION_VERSION = 1

export const ATTACK_DISPLAY_PRESENTATION_DECISIONS = Object.freeze({
  REUSE: 'reuse',
  KNOWN_ZERO: 'known-zero',
  RECALCULATE: 'recalculate',
  RESOURCE_REJECTED: 'resource-rejected',
  NOT_PROJECTABLE: 'not-projectable',
})

export const ATTACK_SCORE_DISPLAY_PRESENTATION_DECISIONS =
  ATTACK_DISPLAY_PRESENTATION_DECISIONS

export class AttackPresentationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'AttackPresentationError'
    this.code = code
    this.details = Object.freeze({ ...details })
    this.attackPresentation = true
  }
}

export function isAttackPresentationError(error) {
  return error?.attackPresentation === true
    && typeof error.code === 'string'
}

const TYPED_ARRAY_CONSTRUCTORS = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  ...(typeof BigInt64Array === 'function'
    ? [BigInt64Array, BigUint64Array]
    : []),
]

const BIGINT_TYPED_ARRAY_CONSTRUCTORS = [
  ...(typeof BigInt64Array === 'function'
    ? [BigInt64Array, BigUint64Array]
    : []),
]

function fail(code, message, details = {}) {
  throw new AttackPresentationError(code, message, details)
}

function reflectionFailure(code, path, operation, error) {
  let causeName
  try {
    causeName = typeof error?.name === 'string' ? error.name : undefined
  } catch {
    // A proxy may throw even while the original trap error is being described.
  }
  fail(
    code,
    `${path} could not be inspected safely`,
    {
      path,
      operation,
      causeName,
    }
  )
}

function safeGetPrototypeOf(value, path, code) {
  try {
    return Object.getPrototypeOf(value)
  } catch (error) {
    reflectionFailure(code, path, 'getPrototypeOf', error)
  }
}

function safeGetOwnPropertyDescriptor(value, property, path, code) {
  try {
    return Object.getOwnPropertyDescriptor(value, property)
  } catch (error) {
    reflectionFailure(
      code,
      `${path}.${String(property)}`,
      'getOwnPropertyDescriptor',
      error
    )
  }
}

function safeGetOwnPropertyNames(value, path, code) {
  try {
    return Object.getOwnPropertyNames(value)
  } catch (error) {
    reflectionFailure(code, path, 'getOwnPropertyNames', error)
  }
}

function safeGetOwnPropertySymbols(value, path, code) {
  try {
    return Object.getOwnPropertySymbols(value)
  } catch (error) {
    reflectionFailure(code, path, 'getOwnPropertySymbols', error)
  }
}

function safeIsArray(value, path, code) {
  try {
    return Array.isArray(value)
  } catch (error) {
    reflectionFailure(code, path, 'Array.isArray', error)
  }
}

function safeArrayBufferIsView(value, path, code) {
  try {
    return ArrayBuffer.isView(value)
  } catch (error) {
    reflectionFailure(code, path, 'ArrayBuffer.isView', error)
  }
}

function safeInstanceOf(value, constructor, path, code) {
  try {
    return value instanceof constructor
  } catch (error) {
    reflectionFailure(code, path, 'instanceof', error)
  }
}

function safeReadProperty(value, property, path, code) {
  try {
    return value[property]
  } catch (error) {
    reflectionFailure(code, `${path}.${property}`, 'property-read', error)
  }
}

function isDataDescriptor(descriptor) {
  return descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
}

function isPlainRecord(value, path, code) {
  if (value === null || typeof value !== 'object') {
    return false
  }
  if (safeIsArray(value, path, code)) {
    return false
  }
  const prototype = safeGetPrototypeOf(value, path, code)
  return prototype === Object.prototype || prototype === null
}

function requirePlainRecord(value, path, code) {
  if (!isPlainRecord(value, path, code)) {
    fail(code, `${path} must be a plain record`, { path })
  }
  return value
}

function requireOwnDataProperty(value, property, path, code) {
  const descriptor = safeGetOwnPropertyDescriptor(value, property, path, code)
  if (!isDataDescriptor(descriptor) || !descriptor.enumerable) {
    fail(
      code,
      `${path}.${property} must be an own enumerable data property`,
      { path: `${path}.${property}` }
    )
  }
  return descriptor.value
}

function readOptionalOwnDataProperty(value, property, path, code) {
  const descriptor = safeGetOwnPropertyDescriptor(value, property, path, code)
  if (descriptor === undefined) {
    return undefined
  }
  if (!isDataDescriptor(descriptor) || !descriptor.enumerable) {
    fail(
      code,
      `${path}.${property} must be an enumerable data property`,
      { path: `${path}.${property}` }
    )
  }
  return descriptor.value
}

function validateOwnDataProperties(value, path, code) {
  requirePlainRecord(value, path, code)
  for (const property of safeGetOwnPropertyNames(value, path, code)) {
    const descriptor = safeGetOwnPropertyDescriptor(value, property, path, code)
    if (!isDataDescriptor(descriptor) || !descriptor.enumerable) {
      fail(
        code,
        `${path}.${property} must be an enumerable data property`,
        { path: `${path}.${property}` }
      )
    }
  }
  if (safeGetOwnPropertySymbols(value, path, code).length > 0) {
    fail(code, `${path} must not contain symbol properties`, { path })
  }
  return value
}

function requireArray(value, path, code) {
  if (!safeIsArray(value, path, code)) {
    fail(code, `${path} must be an array`, { path })
  }
  return value
}

function readArrayLength(array, path, code) {
  const descriptor = safeGetOwnPropertyDescriptor(array, 'length', path, code)
  if (!isDataDescriptor(descriptor) || descriptor.enumerable) {
    fail(code, `${path}.length must be an own data property`, { path })
  }
  if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 0) {
    fail(code, `${path}.length must be a non-negative safe integer`, { path })
  }
  return descriptor.value
}

function readArrayItem(array, index, path, code) {
  const descriptor = safeGetOwnPropertyDescriptor(
    array,
    String(index),
    path,
    code
  )
  if (!isDataDescriptor(descriptor) || !descriptor.enumerable) {
    fail(code, `${path}[${index}] must be an array entry`, { path, index })
  }
  return descriptor.value
}

function validateId(id, path) {
  if (
    typeof id !== 'string'
    && !(typeof id === 'number' && Number.isFinite(id))
  ) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO,
      `${path} must be a string or finite number`,
      { path }
    )
  }
}

function snapshotBatchResult(batchResult) {
  validateOwnDataProperties(
    batchResult,
    'batchResult',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )

  const combos = requireArray(
    requireOwnDataProperty(
      batchResult,
      'combos',
      'batchResult',
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
    ),
    'batchResult.combos',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )
  const comboCount = readArrayLength(
    combos,
    'batchResult.combos',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )

  const totalDamage = requireOwnDataProperty(
    batchResult,
    'totalDamage',
    'batchResult',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY
  )
  const totalDamageSummary = requireOwnDataProperty(
    batchResult,
    'totalDamageSummary',
    'batchResult',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY
  )

  const comboSnapshots = []
  for (let index = 0; index < comboCount; index += 1) {
    const combo = requirePlainRecord(
      readArrayItem(
        combos,
        index,
        'batchResult.combos',
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ),
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    validateOwnDataProperties(
      combo,
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )

    const id = requireOwnDataProperty(
      combo,
      'id',
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    validateId(id, `batchResult.combos[${index}].id`)

    const score = requireOwnDataProperty(
      combo,
      'score',
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const scoreSummary = requireOwnDataProperty(
      combo,
      'scoreSummary',
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const damage = requireOwnDataProperty(
      combo,
      'damage',
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const damageSummary = requireOwnDataProperty(
      combo,
      'damageSummary',
      `batchResult.combos[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY
    )

    comboSnapshots.push({
      id,
      score,
      scoreSummary,
      damage,
      damageSummary,
    })
  }

  return {
    combos: comboSnapshots,
    totalDamage,
    totalDamageSummary,
  }
}

function snapshotRangePlans(rangePlans, comboCount) {
  requireArray(
    rangePlans,
    'rangePlans',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLANS
  )
  const rangePlanCount = readArrayLength(
    rangePlans,
    'rangePlans',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLANS
  )
  if (rangePlanCount !== comboCount) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.RANGE_PLAN_COUNT_MISMATCH,
      'rangePlans length must match batchResult.combos length',
      { comboCount, rangePlanCount }
    )
  }

  const snapshots = []
  for (let index = 0; index < rangePlanCount; index += 1) {
    const rangePlan = readArrayItem(
      rangePlans,
      index,
      'rangePlans',
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    requirePlainRecord(
      rangePlan,
      `rangePlans[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    validateOwnDataProperties(
      rangePlan,
      `rangePlans[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    const warningsDescriptor = safeGetOwnPropertyDescriptor(
      rangePlan,
      'warnings',
      `rangePlans[${index}]`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    const warnings = warningsDescriptor === undefined
      ? []
      : requireOwnDataProperty(
          rangePlan,
          'warnings',
          `rangePlans[${index}]`,
          ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
        )
    if (warnings !== undefined && !safeIsArray(
      warnings,
      `rangePlans[${index}].warnings`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )) {
      fail(
        ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
        `rangePlans[${index}].warnings must be an array`,
        { path: `rangePlans[${index}].warnings` }
      )
    }
    snapshots.push({
      plan: rangePlan,
      warnings: warnings ?? [],
    })
  }
  return snapshots
}

function createCloneState() {
  return {
    ancestors: new WeakSet(),
    memo: new WeakMap(),
    nodes: 0,
  }
}

function countCloneNode(state, path) {
  state.nodes += 1
  if (state.nodes > DISTRIBUTION_PRESENTATION_MAX_JSON_NODES) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
      `${path} exceeds the clone node limit`,
      {
        path,
        limit: DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
      }
    )
  }
}

function validateCloneDepth(depth, path) {
  if (depth > DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
      `${path} exceeds the clone depth limit`,
      {
        path,
        limit: DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH,
      }
    )
  }
}

function cloneFailure(path, message, details = {}) {
  fail(
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_CLONE,
    message,
    { path, ...details }
  )
}

function unsafeClone(path, message, details = {}) {
  fail(
    ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
    message,
    { path, ...details }
  )
}

function validateBinaryOwnProperties(value, path, code) {
  for (const property of safeGetOwnPropertyNames(value, path, code)) {
    const descriptor = safeGetOwnPropertyDescriptor(value, property, path, code)
    if (!isDataDescriptor(descriptor)) {
      cloneFailure(
        `${path}.${property}`,
        'binary clone input must not contain accessor properties'
      )
    }
  }
  if (safeGetOwnPropertySymbols(value, path, code).length > 0) {
    cloneFailure(path, 'binary clone input must not contain symbol properties')
  }
}

function getExactTypedArrayConstructor(value, path, code) {
  const prototype = safeGetPrototypeOf(value, path, code)
  for (const constructor of TYPED_ARRAY_CONSTRUCTORS) {
    if (prototype === constructor.prototype) {
      return constructor
    }
  }
  unsafeClone(path, 'typed array subclasses are not supported')
}

function cloneArrayBuffer(value, path, code) {
  validateBinaryOwnProperties(value, path, code)
  try {
    return ArrayBuffer.prototype.slice.call(value)
  } catch (error) {
    reflectionFailure(code, path, 'ArrayBuffer.slice', error)
  }
}

function cloneDataView(value, path, code) {
  validateBinaryOwnProperties(value, path, code)
  const buffer = safeReadProperty(value, 'buffer', path, code)
  const byteOffset = safeReadProperty(value, 'byteOffset', path, code)
  const byteLength = safeReadProperty(value, 'byteLength', path, code)
  if (
    !Number.isSafeInteger(byteOffset)
    || byteOffset < 0
    || !Number.isSafeInteger(byteLength)
    || byteLength < 0
  ) {
    cloneFailure(`${path}.byteLength`, 'binary view dimensions are invalid')
  }
  try {
    const bytes = new Uint8Array(buffer, byteOffset, byteLength)
    return new DataView(bytes.slice().buffer)
  } catch (error) {
    reflectionFailure(code, path, 'DataView.clone', error)
  }
}

function cloneTypedArray(value, path, code) {
  validateBinaryOwnProperties(value, path, code)
  const constructor = getExactTypedArrayConstructor(value, path, code)
  if (BIGINT_TYPED_ARRAY_CONSTRUCTORS.includes(constructor)) {
    unsafeClone(path, 'BigInt typed arrays are not JSON-safe')
  }
  try {
    return new constructor(value)
  } catch (error) {
    reflectionFailure(code, path, 'TypedArray.clone', error)
  }
}

function cloneMutableValue(
  value,
  path,
  code,
  state,
  depth = 0,
  skipProperties = null
) {
  validateCloneDepth(depth, path)

  if (value === null || value === undefined) {
    countCloneNode(state, path)
    return value
  }

  const type = typeof value
  if (type === 'string' || type === 'boolean') {
    countCloneNode(state, path)
    return value
  }
  if (type === 'number') {
    countCloneNode(state, path)
    if (!Number.isFinite(value)) {
      unsafeClone(path, 'clone input numbers must be finite')
    }
    return value
  }
  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    unsafeClone(path, 'clone input must be JSON-safe')
  }
  if (type !== 'object') {
    unsafeClone(path, 'clone input must be JSON-safe')
  }

  if (state.ancestors.has(value)) {
    unsafeClone(path, 'clone input must not contain a circular reference')
  }
  if (state.memo.has(value)) {
    return state.memo.get(value)
  }
  countCloneNode(state, path)

  if (safeIsArray(value, path, code)) {
    const length = readArrayLength(value, path, code)
    if (length > DISTRIBUTION_PRESENTATION_MAX_JSON_NODES) {
      fail(
        ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
        `${path} exceeds the clone node limit`,
        {
          path,
          limit: DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
        }
      )
    }
    const copy = new Array(length)
    state.memo.set(value, copy)
    state.ancestors.add(value)
    try {
      for (let index = 0; index < length; index += 1) {
        const descriptor = safeGetOwnPropertyDescriptor(
          value,
          String(index),
          path,
          code
        )
        if (descriptor === undefined) {
          continue
        }
        if (!isDataDescriptor(descriptor)) {
          cloneFailure(
            `${path}[${index}]`,
            'array clone input must not contain accessor properties'
          )
        }
        Object.defineProperty(copy, String(index), {
          configurable: true,
          enumerable: true,
          value: cloneMutableValue(
            descriptor.value,
            `${path}[${index}]`,
            code,
            state,
            depth + 1
          ),
          writable: true,
        })
      }
    } finally {
      state.ancestors.delete(value)
    }
    return copy
  }

  if (safeInstanceOf(value, ArrayBuffer, path, code)) {
    const prototype = safeGetPrototypeOf(value, path, code)
    if (prototype !== ArrayBuffer.prototype) {
      unsafeClone(path, 'ArrayBuffer subclasses are not supported')
    }
    const copy = cloneArrayBuffer(value, path, code)
    state.memo.set(value, copy)
    return copy
  }

  if (safeInstanceOf(value, DataView, path, code)) {
    const prototype = safeGetPrototypeOf(value, path, code)
    if (prototype !== DataView.prototype) {
      unsafeClone(path, 'DataView subclasses are not supported')
    }
    const copy = cloneDataView(value, path, code)
    state.memo.set(value, copy)
    return copy
  }

  if (safeArrayBufferIsView(value, path, code)) {
    const copy = cloneTypedArray(value, path, code)
    state.memo.set(value, copy)
    return copy
  }

  if (!isPlainRecord(value, path, code)) {
    unsafeClone(
      path,
      'clone input must contain only plain records, arrays, or binary views'
    )
  }

  const ownSymbols = safeGetOwnPropertySymbols(value, path, code)
  if (ownSymbols.length > 0) {
    cloneFailure(path, 'clone input must not contain symbol properties')
  }
  const copy = Object.create(safeGetPrototypeOf(value, path, code))
  state.memo.set(value, copy)
  state.ancestors.add(value)
  try {
    for (const property of safeGetOwnPropertyNames(value, path, code)) {
      if (skipProperties?.has(property)) {
        continue
      }
      const descriptor = safeGetOwnPropertyDescriptor(value, property, path, code)
      if (!isDataDescriptor(descriptor) || !descriptor.enumerable) {
        cloneFailure(
          `${path}.${property}`,
          'clone input must contain enumerable data properties only'
        )
      }
      Object.defineProperty(copy, property, {
        configurable: true,
        enumerable: true,
        value: cloneMutableValue(
          descriptor.value,
          `${path}.${property}`,
          code,
          state,
          depth + 1
        ),
        writable: true,
      })
    }
  } finally {
    state.ancestors.delete(value)
  }
  return copy
}

function freezeClone(value, path = 'clone', seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value
  }
  seen.add(value)

  if (
    safeInstanceOf(
      value,
      ArrayBuffer,
      path,
      ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
    )
    || safeArrayBufferIsView(
      value,
      path,
      ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
    )
  ) {
    try {
      Object.freeze(value)
    } catch {
      // TypedArray elements cannot be frozen by JavaScript engines. The clone
      // still owns an independent buffer, so input aliases remain impossible.
    }
    return value
  }

  for (const property of safeGetOwnPropertyNames(
    value,
    path,
    ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
  )) {
    const descriptor = safeGetOwnPropertyDescriptor(
      value,
      property,
      path,
      ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
    )
    if (isDataDescriptor(descriptor)) {
      freezeClone(descriptor.value, `${path}.${property}`, seen)
    }
  }
  return Object.freeze(value)
}

function cloneAndFreeze(value, path, code) {
  const clone = cloneMutableValue(value, path, code, createCloneState())
  return freezeClone(clone, path)
}

function copyRangePlan(rangePlan, warnings, path) {
  const state = createCloneState()
  const copy = cloneMutableValue(
    rangePlan,
    path,
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
    state,
    0,
    new Set(['warnings'])
  )
  Object.defineProperty(copy, 'warnings', {
    configurable: true,
    enumerable: true,
    value: cloneMutableValue(
      warnings,
      `${path}.warnings`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
      state
    ),
    writable: true,
  })
  return freezeClone(copy, path)
}

function addEntryId(warning, entryId) {
  return {
    ...warning,
    entryId,
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isScoreEnvelope(value) {
  return isRecord(value)
    && isRecord(value.result)
    && isRecord(value.metadata)
    && value.metadata.modeledDistribution === true
}

function createScoreSidePresentation(envelope) {
  if (!isScoreEnvelope(envelope)) {
    return null
  }

  const summary = {
    mass: getProbabilityMassSummary(envelope.result),
    expectedValue: getExpectedValueSummary(envelope.result),
  }
  return presentDistribution(envelope, { summary })
}

/**
 * Keep the complete score display separate from the selected chart
 * window. The action side is the side currently shown by Attack's score
 * chart; the reaction side is retained for the same batch and for
 * future consumers without making it a reason to recalculate this chart.
 */
function createScorePresentation(score) {
  if (!isRecord(score)) {
    return null
  }

  const action = createScoreSidePresentation(score.action)
  if (action === null) {
    return null
  }
  const reaction = createScoreSidePresentation(score.reaction)
  return Object.freeze({
    action,
    ...(reaction === null ? {} : { reaction }),
  })
}

export const createAttackScorePresentation =
  createScorePresentation

function normalizeAttackDisplayOptions(options) {
  requirePlainRecord(
    options,
    'options',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS
  )

  const rawDisplayRequest = readOptionalOwnDataProperty(
    options,
    'displayRequest',
    'options',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS
  )
  const rangePlans = readOptionalOwnDataProperty(
    options,
    'rangePlans',
    'options',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS
  )
  const policy = readOptionalOwnDataProperty(
    options,
    'policy',
    'options',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS
  )

  // An own `undefined` value keeps the existing optional-property semantics;
  // null is an explicit value and must not silently become an omission.
  if (rawDisplayRequest === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.displayRequest must not be null',
      { path: 'options.displayRequest' }
    )
  }
  const rawScoreDisplayRequest = readOptionalOwnDataProperty(
    options,
    'scoreDisplayRequest',
    'options',
    ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS
  )
  if (rangePlans === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.rangePlans must not be null',
      { path: 'options.rangePlans' }
    )
  }
  if (rawScoreDisplayRequest === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.scoreDisplayRequest must not be null',
      { path: 'options.scoreDisplayRequest' }
    )
  }
  if (policy === null) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_DISPLAY_OPTIONS,
      'options.policy must not be null',
      { path: 'options.policy' }
    )
  }

  return {
    displayRequest: createAttackDisplayRequestSnapshot(
      rawDisplayRequest === undefined
        ? DEFAULT_ATTACK_DISPLAY_REQUEST
        : rawDisplayRequest
    ),
    scoreDisplayRequest: createAttackDisplayRequestSnapshot(
      rawScoreDisplayRequest === undefined
        ? rawDisplayRequest === undefined
          ? DEFAULT_ATTACK_DISPLAY_REQUEST
          : rawDisplayRequest
        : rawScoreDisplayRequest
    ),
    rangePlans: rangePlans === undefined ? [] : rangePlans,
    policy,
  }
}

function hasPotentialUpperBoundOverflow(overflow) {
  return overflow?.kind === 'upper-bound'
    && (overflow.errorBound > 0 || overflow.probabilityUpperBound > 0)
}

function hasTerminalUpperBoundEvidence(side) {
  if (
    side.plan.status === 'resource-rejected'
    || side.plan.decision === 'known-zero'
  ) {
    return false
  }

  const overflow = side.plan.coverage.overflow
  if (!hasPotentialUpperBoundOverflow(overflow)) {
    return false
  }

  const projectionUncertainty = side.plan.coverage.projectionUncertainty
  if (
    projectionUncertainty !== undefined
    && projectionUncertainty !== null
    && projectionUncertainty.positionUnknownProbabilityUpperBound <=
      DISPLAY_PROBABILITY_TOLERANCE
  ) {
    const hasOutputOverflowLowerBound =
      Object.prototype.hasOwnProperty.call(
        projectionUncertainty,
        'outputOverflowLowerBound'
      ) && projectionUncertainty.outputOverflowLowerBound !== null
    if (!hasOutputOverflowLowerBound) {
      return false
    }
    const outputOverflowLowerBound =
      projectionUncertainty.outputOverflowLowerBound
    if (
      outputOverflowLowerBound === null
      || outputOverflowLowerBound > side.plan.displayWindow.max
    ) {
      return side.series.mode === ATTACK_DISPLAY_MODES.UPPER_TAIL
    }
  }

  return side.series.mode === ATTACK_DISPLAY_MODES.UPPER_TAIL
    || overflow.lowerBound <= side.plan.displayWindow.max
}

function getAttackDisplaySideDecision(side) {
  if (
    side.plan.status === 'resource-rejected'
    || side.series.reason === CHART_SERIES_NOT_READY_REASONS.RESOURCE_REJECTED
  ) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  }

  if (hasTerminalUpperBoundEvidence(side)) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }

  if (side.series.status === 'not-projectable') {
    if (
      side.series.reason
      === CHART_SERIES_NOT_PROJECTABLE_REASONS.EXACT_OVERFLOW_OVERLAP
    ) {
      return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
    }
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }

  if (side.series.status === 'not-ready') {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
  }

  if (side.plan.decision === 'known-zero') {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.KNOWN_ZERO
  }

  return ATTACK_DISPLAY_PRESENTATION_DECISIONS.REUSE
}

function getAttackDisplaySideReason(side) {
  if (hasTerminalUpperBoundEvidence(side)) {
    return CHART_SERIES_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW
  }
  return side.series.reason ?? null
}

function getAttackDisplayStatus(sides) {
  if (sides.some(({ series }) => series.status === 'not-projectable')) {
    return 'not-projectable'
  }
  if (sides.some(({ series }) => series.status === 'not-ready')) {
    return 'not-ready'
  }
  return 'ready'
}

function getAttackDisplayDecision(sides) {
  const decisions = sides.map(getAttackDisplaySideDecision)
  if (decisions.includes(
    ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  )) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.NOT_PROJECTABLE
  }
  if (decisions.includes(
    ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  )) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED
  }
  if (decisions.includes(
    ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
  )) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
  }
  if (decisions.every((decision) => (
    decision === ATTACK_DISPLAY_PRESENTATION_DECISIONS.KNOWN_ZERO
  ))) {
    return ATTACK_DISPLAY_PRESENTATION_DECISIONS.KNOWN_ZERO
  }
  return ATTACK_DISPLAY_PRESENTATION_DECISIONS.REUSE
}

function createAttackDisplaySide(
  display,
  displayRequest,
  policy,
  id
) {
  const plannerOptions = {
    displayWindow: {
      min: displayRequest.min,
      max: displayRequest.max,
    },
  }
  if (policy !== undefined) {
    plannerOptions.policy = policy
  }

  const plan = planDisplayRange(display, plannerOptions)
  const series = createChartSeries(display, plan, {
    mode: displayRequest.mode,
  })
  const chart = series.status === 'ready'
    ? materializeChartJsData(series)
    : null
  const side = {
    ...(id === undefined ? {} : { id }),
    display,
    plan,
    series,
    chart,
    status: series.status,
    reason: null,
  }
  side.reason = getAttackDisplaySideReason(side)
  side.decision = getAttackDisplaySideDecision(side)
  return Object.freeze(side)
}

function createAttackScoreDisplayPresentation(
  scorePresentation,
  displayRequest,
  policy
) {
  if (
    !isRecord(scorePresentation)
    || !isRecord(scorePresentation.action)
  ) {
    return null
  }

  const action = createAttackDisplaySide(
    scorePresentation.action,
    displayRequest,
    policy
  )
  if (action === null) {
    return null
  }
  const reaction = !isRecord(scorePresentation.reaction)
    ? null
    : createAttackDisplaySide(
        scorePresentation.reaction,
        displayRequest,
        policy
      )

  // Attack's existing score chart displays the action side only. Retain the
  // reaction side in the atomic payload, but do not make an undisplayed side
  // trigger a score chart recalculation or hide the action chart.
  const displayedSides = [action]
  return Object.freeze({
    version: ATTACK_DISPLAY_PRESENTATION_VERSION,
    kind: 'attack-canonical-score-display-presentation',
    status: getAttackDisplayStatus(displayedSides),
    decision: getAttackDisplayDecision(displayedSides),
    mode: displayRequest.mode,
    displayRequest,
    action,
    reaction,
  })
}

/**
 * Build one UI-independent presentation payload for an attack batch.
 * The batch result is consumed as a completed value; no calculation or
 * legacy projection is performed here.
 */
export function createAttackPresentation(
  batchResult,
  rangePlans = []
) {
  const snapshot = snapshotBatchResult(batchResult)
  const planSnapshots = snapshotRangePlans(rangePlans, snapshot.combos.length)
  const combos = []
  const totalWarnings = []

  for (let index = 0; index < snapshot.combos.length; index += 1) {
    const combo = snapshot.combos[index]
    const rangePlan = planSnapshots[index]
    const damagePresentation = presentDistribution(
      combo.damage,
      {
        summary: combo.damageSummary,
        warnings: rangePlan.warnings,
      }
    )

    for (const warning of damagePresentation.warnings) {
      totalWarnings.push(addEntryId(warning, combo.id))
    }

    const score = cloneAndFreeze(
      combo.score,
      `batchResult.combos[${index}].score`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const scoreSummary = cloneAndFreeze(
      combo.scoreSummary,
      `batchResult.combos[${index}].scoreSummary`,
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const scorePresentation = createScorePresentation(
      score
    )

    combos.push(Object.freeze({
      id: combo.id,
      score,
      scoreSummary,
      scorePresentation,
      damage: combo.damage,
      damageSummary: combo.damageSummary,
      damagePresentation,
      rangePlan: copyRangePlan(
        rangePlan.plan,
        damagePresentation.warnings,
        `rangePlans[${index}]`
      ),
    }))
  }

  const totalDamagePresentation = presentDistribution(
    snapshot.totalDamage,
    {
      summary: snapshot.totalDamageSummary,
      warnings: totalWarnings,
    }
  )

  return Object.freeze({
    combos: Object.freeze(combos),
    totalDamage: snapshot.totalDamage,
    totalDamageSummary: snapshot.totalDamageSummary,
    totalDamagePresentation,
  })
}

/**
 * Connect a completed Attack batch to the shared dynamic display
 * contract. The calculation result is first passed through the existing
 * Attack presenter, then each combo and the total are
 * independently planned and adapted to a dense chart series. No calculation,
 * legacy projection, or fallback is performed here.
 *
 * `options` is `{ displayRequest, rangePlans, policy }`. `rangePlans` are the
 * calculation plans already collected by AttackRunner; they are only
 * used by the existing presenter to retain calculation warnings. `policy` is
 * the independent DisplayRangePlanner resource policy.
 */
function buildAttackDisplayPresentationFrom(
  presentation,
  normalized
) {
  const scoreCombos = presentation.combos.map((combo) => {
    const scorePresentation = createAttackScoreDisplayPresentation(
      combo.scorePresentation,
      normalized.scoreDisplayRequest,
      normalized.policy
    )
    if (scorePresentation === null) {
      return null
    }
    return Object.freeze({
      id: combo.id,
      scoreSummary: combo.scoreSummary,
      ...scorePresentation,
    })
  })
  const combos = presentation.combos.map((combo, index) => {
    const side = createAttackDisplaySide(
      combo.damagePresentation,
      normalized.displayRequest,
      normalized.policy,
      combo.id
    )
    return Object.freeze({
      ...side,
      // Keep the calculation plan available to the application feedback
      // lane while `plan` remains the display-window plan.
      rangePlan: combo.rangePlan,
      score: combo.score ?? null,
      scoreSummary: combo.scoreSummary ?? null,
      scorePresentation: combo.scorePresentation ?? null,
      scoreDisplay: scoreCombos[index],
    })
  })
  const total = createAttackDisplaySide(
    presentation.totalDamagePresentation,
    normalized.displayRequest,
    normalized.policy,
  )
  const sides = [...combos, total]
  const scoreSides = scoreCombos
    .filter((score) => score !== null)
    .map((score) => score.action)
  const hasMissingScore = scoreCombos.some((score) => score === null)
  const score = scoreSides.length === 0
    ? null
    : Object.freeze({
        version: ATTACK_DISPLAY_PRESENTATION_VERSION,
        kind: 'attack-canonical-score-display-presentation',
        status: hasMissingScore
          ? 'not-ready'
          : getAttackDisplayStatus(scoreSides),
        decision: hasMissingScore
          ? ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
          : getAttackDisplayDecision(scoreSides),
        mode: normalized.scoreDisplayRequest.mode,
        displayRequest: normalized.scoreDisplayRequest,
        combos: Object.freeze(scoreCombos),
      })

  return Object.freeze({
    version: ATTACK_DISPLAY_PRESENTATION_VERSION,
    kind: 'attack-canonical-display-presentation',
    status: getAttackDisplayStatus(sides),
    decision: getAttackDisplayDecision(sides),
    mode: normalized.displayRequest.mode,
    displayRequest: normalized.displayRequest,
    combos: Object.freeze(combos),
    total,
    score,
  })
}

/**
 * Re-plan an already presented Attack result for a new display
 * window or mode. The distribution presenter has already made the
 * defensive copy at the calculation-result boundary, so changing the window
 * only creates the window-sized chart series.
 */
export function createAttackDisplayPresentationFrom(
  presentation,
  options = {}
) {
  const normalized = normalizeAttackDisplayOptions(options)
  if (
    presentation === null
    || typeof presentation !== 'object'
    || Array.isArray(presentation)
    || !Array.isArray(presentation.combos)
  ) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT,
      'attack presentation must contain a combos array',
      { path: 'presentation.combos' }
    )
  }
  if (!Object.prototype.hasOwnProperty.call(
    presentation,
    'totalDamagePresentation'
  )) {
    fail(
      ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY,
      'attack presentation must contain a total damage presentation',
      { path: 'presentation.totalDamagePresentation' }
    )
  }
  return buildAttackDisplayPresentationFrom(
    presentation,
    normalized
  )
}

export function createAttackDisplayPresentation(
  batchResult,
  options = {}
) {
  const normalized = normalizeAttackDisplayOptions(options)
  const presentation = createAttackPresentation(
    batchResult,
    normalized.rangePlans
  )
  return buildAttackDisplayPresentationFrom(
    presentation,
    normalized
  )
}
