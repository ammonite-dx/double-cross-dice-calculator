export const CALCULATION_BATCH_INPUT_ERROR_CODES = Object.freeze({
  INVALID_ENTRIES: 'invalid-entries',
  INVALID_ENTRY: 'invalid-entry',
  INVALID_ID: 'invalid-id',
  DUPLICATE_ID: 'duplicate-id',
  INVALID_PARAMS: 'invalid-params',
  INVALID_OPTIONS: 'invalid-options',
})

export class CalculationBatchInputError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'CalculationBatchInputError'
    this.code = code
    this.details = Object.freeze({ ...details })
    this.calculationBatchInput = true
  }
}

export function isCalculationBatchInputError(error) {
  return error?.calculationBatchInput === true
    && typeof error.code === 'string'
}

function isRecord(value) {
  try {
    return value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
  } catch {
    return false
  }
}

function failBatchInput(code, message, details = {}) {
  throw new CalculationBatchInputError(code, message, details)
}

function readBatchDataProperty(
  object,
  property,
  path,
  code,
  { required = false, allowNonEnumerable = false, rejectPrototype = true } = {}
) {
  if (object === null || typeof object !== 'object') {
    failBatchInput(
      code,
      `${path} must be an object`,
      { path }
    )
  }

  let descriptor
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, property)
  } catch (error) {
    failBatchInput(
      code,
      `${path} could not be inspected safely`,
      { path, causeName: error?.name }
    )
  }

  if (descriptor !== undefined) {
    if (!allowNonEnumerable && descriptor.enumerable !== true) {
      failBatchInput(
        code,
        `${path} must be an own enumerable data property`,
        { path }
      )
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      failBatchInput(
        code,
        `${path} must not be an accessor property`,
        { path }
      )
    }
    return { present: true, value: descriptor.value }
  }

  if (rejectPrototype) {
    let prototype
    try {
      prototype = Object.getPrototypeOf(object)
    } catch (error) {
      failBatchInput(
        code,
        `${path} prototype could not be inspected safely`,
        { path, causeName: error?.name }
      )
    }
    const visited = new Set()
    while (prototype !== null) {
      if (visited.has(prototype)) {
        failBatchInput(
          code,
          `${path} prototype chain is invalid`,
          { path }
        )
      }
      visited.add(prototype)
      let inheritedDescriptor
      try {
        inheritedDescriptor = Object.getOwnPropertyDescriptor(
          prototype,
          property
        )
      } catch (error) {
        failBatchInput(
          code,
          `${path} prototype could not be inspected safely`,
          { path, causeName: error?.name }
        )
      }
      if (inheritedDescriptor !== undefined) {
        failBatchInput(
          code,
          `${path} must not be inherited from a prototype`,
          { path }
        )
      }
      try {
        prototype = Object.getPrototypeOf(prototype)
      } catch (error) {
        failBatchInput(
          code,
          `${path} prototype could not be inspected safely`,
          { path, causeName: error?.name }
        )
      }
    }
  }

  if (required) {
    failBatchInput(
      code,
      `${path} is required`,
      { path }
    )
  }
  return { present: false, value: undefined }
}

function getBatchOwnKeys(object, path, code) {
  try {
    return Reflect.ownKeys(object)
  } catch (error) {
    failBatchInput(
      code,
      `${path} own properties could not be inspected safely`,
      { path, causeName: error?.name }
    )
  }
}

function defineBatchDataProperty(target, property, value, path, code) {
  try {
    Object.defineProperty(target, property, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  } catch (error) {
    failBatchInput(
      code,
      `${path} could not be snapshotted safely`,
      { path, causeName: error?.name }
    )
  }
}

function snapshotBatchEnumerableDataProperties(object, path, code) {
  const snapshot = {}
  for (const property of getBatchOwnKeys(object, path, code)) {
    let descriptor
    try {
      descriptor = Object.getOwnPropertyDescriptor(object, property)
    } catch (error) {
      failBatchInput(
        code,
        `${path} could not be inspected safely`,
        { path, causeName: error?.name }
      )
    }
    if (descriptor?.enumerable !== true) {
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      failBatchInput(
        code,
        `${path}.${String(property)} must not be an accessor property`,
        { path, property: String(property) }
      )
    }
    defineBatchDataProperty(
      snapshot,
      property,
      descriptor.value,
      `${path}.${String(property)}`,
      code
    )
  }
  return snapshot
}

function snapshotBatchDataValue(value, path, code, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return value
  }

  let isArray
  try {
    isArray = Array.isArray(value)
  } catch (error) {
    failBatchInput(
      code,
      `${path} could not be inspected safely`,
      { path, causeName: error?.name }
    )
  }
  if (!isArray && !isRecord(value)) {
    failBatchInput(
      code,
      `${path} must be a snapshot-safe object`,
      { path }
    )
  }
  if (seen.has(value)) {
    return seen.get(value)
  }

  let target
  if (isArray) {
    const length = readBatchDataProperty(
      value,
      'length',
      `${path}.length`,
      code,
      { required: true, allowNonEnumerable: true, rejectPrototype: false }
    ).value
    if (!Number.isSafeInteger(length) || length < 0) {
      failBatchInput(
        code,
        `${path}.length must be a non-negative safe integer`,
        { path }
      )
    }
    try {
      target = new Array(length)
    } catch (error) {
      failBatchInput(
        code,
        `${path} could not be snapshotted safely`,
        { path, causeName: error?.name }
      )
    }
  } else {
    target = {}
  }
  seen.set(value, target)

  for (const property of getBatchOwnKeys(value, path, code)) {
    if (isArray && property === 'length') {
      continue
    }
    let descriptor
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, property)
    } catch (error) {
      failBatchInput(
        code,
        `${path} could not be inspected safely`,
        { path, causeName: error?.name }
      )
    }
    if (descriptor?.enumerable !== true) {
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      failBatchInput(
        code,
        `${path}.${String(property)} must not be an accessor property`,
        { path, property: String(property) }
      )
    }
    defineBatchDataProperty(
      target,
      property,
      snapshotBatchDataValue(
        descriptor.value,
        `${path}.${String(property)}`,
        code,
        seen
      ),
      `${path}.${String(property)}`,
      code
    )
  }
  return target
}

function snapshotBatchScoreParams(score, path) {
  const snapshot = {}
  for (const property of [
    'dice',
    'critical',
    'skill',
    'yousei',
    'shihai',
  ]) {
    snapshot[property] = readBatchDataProperty(
      score,
      property,
      `${path}.${property}`,
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS
    ).value
  }
  return snapshot
}

function snapshotBatchDamageParams(damage, path, knownProperties) {
  for (const property of knownProperties) {
    readBatchDataProperty(
      damage,
      property,
      `${path}.${property}`,
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS
    )
  }
  return snapshotBatchEnumerableDataProperties(
    damage,
    path,
    CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS
  )
}

function readBatchRecordProperty(object, property, path) {
  const value = readBatchDataProperty(
    object,
    property,
    path,
    CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS,
    { required: true }
  ).value
  if (!isRecord(value)) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS,
      `${path} must be an object`,
      { path }
    )
  }
  return value
}

function snapshotBatchAttackParams(params, index) {
  const paramsPath = `entries[${index}].params`
  if (!isRecord(params)) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS,
      `${paramsPath} must be an object`,
      { index }
    )
  }

  const action = readBatchRecordProperty(params, 'action', `${paramsPath}.action`)
  const reaction = readBatchRecordProperty(
    params,
    'reaction',
    `${paramsPath}.reaction`
  )
  const actionScore = readBatchRecordProperty(
    action,
    'score',
    `${paramsPath}.action.score`
  )
  const actionDamage = readBatchRecordProperty(
    action,
    'damage',
    `${paramsPath}.action.damage`
  )
  const reactionScore = readBatchRecordProperty(
    reaction,
    'score',
    `${paramsPath}.reaction.score`
  )
  const reactionDamage = readBatchRecordProperty(
    reaction,
    'damage',
    `${paramsPath}.reaction.damage`
  )
  const mode = readBatchDataProperty(
    reaction,
    'mode',
    `${paramsPath}.reaction.mode`,
    CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS
  ).value

  return {
    action: {
      score: snapshotBatchScoreParams(
        actionScore,
        `${paramsPath}.action.score`
      ),
      damage: snapshotBatchDamageParams(
        actionDamage,
        `${paramsPath}.action.damage`,
        ['dice', 'value', 'kazanari']
      ),
    },
    reaction: {
      mode,
      score: snapshotBatchScoreParams(
        reactionScore,
        `${paramsPath}.reaction.score`
      ),
      damage: snapshotBatchDamageParams(
        reactionDamage,
        `${paramsPath}.reaction.damage`,
        ['dice', 'value']
      ),
    },
  }
}

function snapshotCanonicalAttackBatchEntries(entries) {
  let isArray
  try {
    isArray = Array.isArray(entries)
  } catch (error) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRIES,
      'entries could not be inspected safely',
      { causeName: error?.name }
    )
  }
  if (!isArray) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRIES,
      'entries must be an array'
    )
  }

  const length = readBatchDataProperty(
    entries,
    'length',
    'entries.length',
    CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRIES,
    { required: true, allowNonEnumerable: true, rejectPrototype: false }
  ).value
  if (!Number.isSafeInteger(length) || length < 0) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRIES,
      'entries.length must be a non-negative safe integer'
    )
  }

  const seenIds = new Set()
  const snapshots = []
  for (let index = 0; index < length; index += 1) {
    const entry = readBatchDataProperty(
      entries,
      String(index),
      `entries[${index}]`,
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRY,
      { required: true }
    ).value
    if (!isRecord(entry)) {
      failBatchInput(
        CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRY,
        `entries[${index}] must be an object`,
        { index }
      )
    }

    const idProperty = readBatchDataProperty(
      entry,
      'id',
      `entries[${index}].id`,
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ID,
    )
    const paramsProperty = readBatchDataProperty(
      entry,
      'params',
      `entries[${index}].params`,
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_PARAMS
    )
    if (!idProperty.present || !paramsProperty.present) {
      failBatchInput(
        CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ENTRY,
        `entries[${index}] must contain id and params`,
        { index }
      )
    }
    const id = idProperty.value
    if (
      typeof id !== 'string'
      && !(typeof id === 'number' && Number.isFinite(id))
    ) {
      failBatchInput(
        CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_ID,
        `entries[${index}].id must be a string or finite number`,
        { index }
      )
    }
    const idKey = typeof id === 'number' && Object.is(id, -0) ? 0 : id
    if (seenIds.has(idKey)) {
      failBatchInput(
        CALCULATION_BATCH_INPUT_ERROR_CODES.DUPLICATE_ID,
        `entries[${index}].id is duplicated`,
        { index }
      )
    }
    seenIds.add(idKey)

    const paramsInput = paramsProperty.value
    snapshots.push({
      id,
      params: snapshotBatchAttackParams(paramsInput, index),
    })
  }
  return snapshots
}

function validateBatchSignal(signal) {
  if (signal === undefined || signal === null) {
    return
  }
  if (typeof signal !== 'object') {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.signal must be an AbortSignal-like object',
      { field: 'signal' }
    )
  }
  let aborted
  try {
    aborted = signal.aborted
  } catch (error) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.signal could not be inspected safely',
      { field: 'signal', causeName: error?.name }
    )
  }
  if (typeof aborted !== 'boolean') {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.signal must be an AbortSignal-like object',
      { field: 'signal' }
    )
  }
}

function validateCanonicalAttackBatchOptions(options) {
  if (!isRecord(options)) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options must be an object'
    )
  }

  for (const property of [
    'signal',
    'requestId',
    'rangePolicy',
    'onRangePlan',
    'onFftLength',
    'maxValuesLength',
    'maxFftLength',
    'maxResourceBytes',
    'maxComponents',
  ]) {
    readBatchDataProperty(
      options,
      property,
      `options.${property}`,
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS
    )
  }

  const snapshot = snapshotBatchEnumerableDataProperties(
    options,
    'options',
    CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS
  )
  const snapshotSeen = new WeakMap()
  for (const property of Reflect.ownKeys(snapshot)) {
    if (property === 'signal' || property === 'onRangePlan' || property === 'onFftLength') {
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(snapshot, property)
    if (descriptor?.value !== null && typeof descriptor?.value === 'object') {
      defineBatchDataProperty(
        snapshot,
        property,
        snapshotBatchDataValue(
          descriptor.value,
          `options.${String(property)}`,
          CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
          snapshotSeen
        ),
        `options.${String(property)}`,
        CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS
      )
    }
  }

  const signal = snapshot.signal
  validateBatchSignal(signal)

  if (
    snapshot.rangePolicy !== undefined
    && snapshot.rangePolicy !== null
    && !isRecord(snapshot.rangePolicy)
  ) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.rangePolicy must be an object',
      { field: 'rangePolicy' }
    )
  }
  if (
    snapshot.onRangePlan !== undefined
    && snapshot.onRangePlan !== null
    && typeof snapshot.onRangePlan !== 'function'
  ) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.onRangePlan must be a function',
      { field: 'onRangePlan' }
    )
  }
  if (
    snapshot.onFftLength !== undefined
    && typeof snapshot.onFftLength !== 'function'
  ) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.onFftLength must be a function',
      { field: 'onFftLength' }
    )
  }
  if (
    snapshot.requestId !== undefined
    && snapshot.requestId !== null
    && typeof snapshot.requestId !== 'string'
    && typeof snapshot.requestId !== 'number'
  ) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'options.requestId must be a string or number',
      { field: 'requestId' }
    )
  }
  return snapshot
}


const CANONICAL_TOTAL_DAMAGE_AGGREGATION_OPTION_NAMES = Object.freeze([
  'maxValuesLength',
  'maxFftLength',
  'maxResourceBytes',
  'maxComponents',
  'signal',
  'onFftLength',
])

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

export function createCanonicalTotalDamageAggregationOptions(
  options,
  defaultOnFftLength
) {
  const aggregationOptions = {}
  for (const name of CANONICAL_TOTAL_DAMAGE_AGGREGATION_OPTION_NAMES) {
    if (hasOwn(options, name)) {
      aggregationOptions[name] = options[name]
    }
  }
  if (
    !hasOwn(aggregationOptions, 'onFftLength')
    && typeof defaultOnFftLength === 'function'
  ) {
    aggregationOptions.onFftLength = defaultOnFftLength
  }
  return aggregationOptions
}

export function snapshotCanonicalAttackBatchRequest(
  entries,
  options = {},
  {
    validateAggregationOptions,
    defaultOnFftLength,
  } = {}
) {
  if (typeof validateAggregationOptions !== 'function') {
    throw new TypeError(
      'snapshotCanonicalAttackBatchRequest requires validateAggregationOptions'
    )
  }

  const batchOptions = validateCanonicalAttackBatchOptions(options)
  const entrySnapshots = snapshotCanonicalAttackBatchEntries(entries)
  const aggregationOptions =
    createCanonicalTotalDamageAggregationOptions(
      batchOptions,
      defaultOnFftLength
    )
  let normalizedAggregationOptions
  try {
    normalizedAggregationOptions = validateAggregationOptions(
      aggregationOptions
    )
  } catch (error) {
    if (isCalculationBatchInputError(error)) {
      throw error
    }
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'canonical total damage options are invalid',
      {
        causeCode: error?.code,
        causeName: error?.name,
        field: 'canonicalTotalDamage',
      }
    )
  }
  if (
    !normalizedAggregationOptions
    || !Number.isSafeInteger(normalizedAggregationOptions.maxComponents)
  ) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'canonical total damage options could not be validated',
      { field: 'canonicalTotalDamage' }
    )
  }
  if (entrySnapshots.length > normalizedAggregationOptions.maxComponents) {
    failBatchInput(
      CALCULATION_BATCH_INPUT_ERROR_CODES.INVALID_OPTIONS,
      'entries length exceeds options.maxComponents',
      {
        field: 'maxComponents',
        length: entrySnapshots.length,
        maxComponents: normalizedAggregationOptions.maxComponents,
      }
    )
  }

  return {
    entries: entrySnapshots,
    options: batchOptions,
    aggregationOptions,
  }
}

