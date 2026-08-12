import {
  DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH,
  DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
  presentCanonicalDistribution,
} from '../presentation'

export const ATTACK_CANONICAL_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_BATCH_RESULT: 'invalid-batch-result',
  INVALID_BATCH_SUMMARY: 'invalid-batch-summary',
  INVALID_CLONE: 'invalid-clone',
  INVALID_COMBO: 'invalid-combo',
  INVALID_RANGE_PLAN: 'invalid-range-plan',
  INVALID_RANGE_PLANS: 'invalid-range-plans',
  RANGE_PLAN_COUNT_MISMATCH: 'range-plan-count-mismatch',
  UNSAFE_CLONE: 'unsafe-clone',
})

export class AttackCanonicalPresentationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'AttackCanonicalPresentationError'
    this.code = code
    this.details = Object.freeze({ ...details })
    this.attackCanonicalPresentation = true
  }
}

export function isAttackCanonicalPresentationError(error) {
  return error?.attackCanonicalPresentation === true
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
  throw new AttackCanonicalPresentationError(code, message, details)
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
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO,
      `${path} must be a string or finite number`,
      { path }
    )
  }
}

function snapshotBatchResult(batchResult) {
  validateOwnDataProperties(
    batchResult,
    'batchResult',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )

  const combos = requireArray(
    requireOwnDataProperty(
      batchResult,
      'combos',
      'batchResult',
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
    ),
    'batchResult.combos',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )
  const comboCount = readArrayLength(
    combos,
    'batchResult.combos',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT
  )

  const canonicalTotalDamage = requireOwnDataProperty(
    batchResult,
    'canonicalTotalDamage',
    'batchResult',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY
  )
  const canonicalTotalDamageSummary = requireOwnDataProperty(
    batchResult,
    'canonicalTotalDamageSummary',
    'batchResult',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY
  )

  const comboSnapshots = []
  for (let index = 0; index < comboCount; index += 1) {
    const combo = requirePlainRecord(
      readArrayItem(
        combos,
        index,
        'batchResult.combos',
        ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ),
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    validateOwnDataProperties(
      combo,
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )

    const id = requireOwnDataProperty(
      combo,
      'id',
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    validateId(id, `batchResult.combos[${index}].id`)

    const score = requireOwnDataProperty(
      combo,
      'score',
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const scoreSummary = requireOwnDataProperty(
      combo,
      'scoreSummary',
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const canonicalDamage = requireOwnDataProperty(
      combo,
      'canonicalDamage',
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
    )
    const canonicalDamageSummary = requireOwnDataProperty(
      combo,
      'canonicalDamageSummary',
      `batchResult.combos[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY
    )

    comboSnapshots.push({
      id,
      score,
      scoreSummary,
      canonicalDamage,
      canonicalDamageSummary,
    })
  }

  return {
    combos: comboSnapshots,
    canonicalTotalDamage,
    canonicalTotalDamageSummary,
  }
}

function snapshotRangePlans(rangePlans, comboCount) {
  requireArray(
    rangePlans,
    'rangePlans',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLANS
  )
  const rangePlanCount = readArrayLength(
    rangePlans,
    'rangePlans',
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLANS
  )
  if (rangePlanCount !== comboCount) {
    fail(
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.RANGE_PLAN_COUNT_MISMATCH,
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
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    requirePlainRecord(
      rangePlan,
      `rangePlans[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    validateOwnDataProperties(
      rangePlan,
      `rangePlans[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    const warningsDescriptor = safeGetOwnPropertyDescriptor(
      rangePlan,
      'warnings',
      `rangePlans[${index}]`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )
    const warnings = warningsDescriptor === undefined
      ? []
      : requireOwnDataProperty(
          rangePlan,
          'warnings',
          `rangePlans[${index}]`,
          ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
        )
    if (warnings !== undefined && !safeIsArray(
      warnings,
      `rangePlans[${index}].warnings`,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN
    )) {
      fail(
        ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
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
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
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
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
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
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_CLONE,
    message,
    { path, ...details }
  )
}

function unsafeClone(path, message, details = {}) {
  fail(
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
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
        ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
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
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
    )
    || safeArrayBufferIsView(
      value,
      path,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
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
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
  )) {
    const descriptor = safeGetOwnPropertyDescriptor(
      value,
      property,
      path,
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.UNSAFE_CLONE
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
    ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
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
      ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLAN,
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

/**
 * Build one UI-independent presentation payload for a canonical attack batch.
 * The batch result is consumed as a completed value; no calculation or
 * legacy projection is performed here.
 */
export function createAttackCanonicalPresentation(
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
    const canonicalDamagePresentation = presentCanonicalDistribution(
      combo.canonicalDamage,
      {
        summary: combo.canonicalDamageSummary,
        warnings: rangePlan.warnings,
      }
    )

    for (const warning of canonicalDamagePresentation.warnings) {
      totalWarnings.push(addEntryId(warning, combo.id))
    }

    combos.push(Object.freeze({
      id: combo.id,
      score: cloneAndFreeze(
        combo.score,
        `batchResult.combos[${index}].score`,
        ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ),
      scoreSummary: cloneAndFreeze(
        combo.scoreSummary,
        `batchResult.combos[${index}].scoreSummary`,
        ATTACK_CANONICAL_PRESENTATION_ERROR_CODES.INVALID_COMBO
      ),
      canonicalDamage: combo.canonicalDamage,
      canonicalDamageSummary: combo.canonicalDamageSummary,
      canonicalDamagePresentation,
      canonicalRangePlan: copyRangePlan(
        rangePlan.plan,
        canonicalDamagePresentation.warnings,
        `rangePlans[${index}]`
      ),
    }))
  }

  const canonicalTotalDamagePresentation = presentCanonicalDistribution(
    snapshot.canonicalTotalDamage,
    {
      summary: snapshot.canonicalTotalDamageSummary,
      warnings: totalWarnings,
    }
  )

  return Object.freeze({
    combos: Object.freeze(combos),
    canonicalTotalDamage: snapshot.canonicalTotalDamage,
    canonicalTotalDamageSummary: snapshot.canonicalTotalDamageSummary,
    canonicalTotalDamagePresentation,
  })
}
