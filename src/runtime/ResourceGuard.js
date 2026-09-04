const BYTES_PER_MIB = 1024 * 1024

export const RESOURCE_GUARD_ERROR_CODES = Object.freeze({
  INVALID_POLICY: 'invalid-policy',
  INVALID_REQUEST: 'invalid-request',
  OVERSIZE: 'oversize',
  QUEUE_FULL: 'queue-full',
  ABORTED: 'aborted',
})

export const DEFAULT_RESOURCE_GUARD_POLICY = Object.freeze({
  capacityBytes: 64 * BYTES_PER_MIB,
  maxActive: 4,
  maxQueued: 32,
  reservationMultiplier: 1.5,
})

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function createDetails(details) {
  return Object.freeze({ ...details })
}

export class ResourceGuardError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ResourceGuardError'
    this.code = code
    this.resourceGuard = true
    this.details = createDetails(details)
  }
}

export class ResourceGuardAbortError extends ResourceGuardError {
  constructor(message = 'The resource guard request was aborted', details = {}) {
    super(RESOURCE_GUARD_ERROR_CODES.ABORTED, message, details)
    this.name = 'AbortError'
  }
}

export function isResourceGuardError(error) {
  return error?.resourceGuard === true
    && typeof error.code === 'string'
}

export function isResourceGuardAbortError(error) {
  return isResourceGuardError(error)
    && error.code === RESOURCE_GUARD_ERROR_CODES.ABORTED
}

function getPolicyValue(policy, key, alias) {
  if (hasOwn(policy, key)) {
    return policy[key]
  }
  if (alias && hasOwn(policy, alias)) {
    return policy[alias]
  }
  return DEFAULT_RESOURCE_GUARD_POLICY[key]
}

function invalidPolicy(message, details = {}) {
  return new ResourceGuardError(
    RESOURCE_GUARD_ERROR_CODES.INVALID_POLICY,
    message,
    details
  )
}

function normalizePolicy(policy = {}) {
  if (!isObject(policy)) {
    throw invalidPolicy('Resource guard policy must be an object')
  }

  const capacityBytes = getPolicyValue(policy, 'capacityBytes', 'capacity')
  const maxActive = getPolicyValue(policy, 'maxActive')
  const maxQueued = getPolicyValue(policy, 'maxQueued')
  const reservationMultiplier = getPolicyValue(
    policy,
    'reservationMultiplier'
  )

  if (!Number.isFinite(capacityBytes) || capacityBytes <= 0) {
    throw invalidPolicy(
      'Resource guard capacityBytes must be a finite positive number',
      { capacityBytes }
    )
  }
  if (!Number.isSafeInteger(maxActive) || maxActive < 1) {
    throw invalidPolicy(
      'Resource guard maxActive must be a positive safe integer',
      { maxActive }
    )
  }
  if (!Number.isSafeInteger(maxQueued) || maxQueued < 0) {
    throw invalidPolicy(
      'Resource guard maxQueued must be a non-negative safe integer',
      { maxQueued }
    )
  }
  if (!Number.isFinite(reservationMultiplier) || reservationMultiplier <= 0) {
    throw invalidPolicy(
      'Resource guard reservationMultiplier must be a finite positive number',
      { reservationMultiplier }
    )
  }

  return Object.freeze({
    capacityBytes,
    maxActive,
    maxQueued,
    reservationMultiplier,
  })
}

function invalidRequest(message, details = {}) {
  return new ResourceGuardError(
    RESOURCE_GUARD_ERROR_CODES.INVALID_REQUEST,
    message,
    details
  )
}

function normalizeMetric(value, name, required = false) {
  if (value === undefined || value === null) {
    if (required) {
      throw invalidRequest(
        `Resource guard ${name} must be a finite non-negative number`,
        { [name]: value }
      )
    }
    return null
  }
  if (!Number.isFinite(value) || value < 0) {
    throw invalidRequest(
      `Resource guard ${name} must be a finite non-negative number`,
      { [name]: value }
    )
  }
  return value
}

function getRequestValue(request, key, estimate) {
  if (hasOwn(request, key)) {
    return request[key]
  }
  if (estimate && hasOwn(estimate, key)) {
    return estimate[key]
  }
  return undefined
}

function normalizeSignal(signal) {
  if (signal === undefined || signal === null) {
    return null
  }
  if (
    typeof signal !== 'object'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw invalidRequest('Resource guard signal must be an AbortSignal-like object')
  }
  return signal
}

function normalizeOperation(operation) {
  if (operation === undefined || operation === null) {
    return 'calculation'
  }
  if (typeof operation !== 'string' || operation.length === 0) {
    throw invalidRequest('Resource guard operation must be a non-empty string')
  }
  return operation
}

function normalizeRequest(request, policy) {
  if (!isObject(request)) {
    throw invalidRequest('Resource guard request must be an object')
  }

  const estimate = isObject(request.estimate) ? request.estimate : null
  const hasFloat64Bytes = request.estimateAvailable === false
    ? false
    : hasOwn(request, 'float64Bytes')
      || Boolean(estimate && hasOwn(estimate, 'float64Bytes'))
  const float64Bytes = getRequestValue(request, 'float64Bytes', estimate)
  const normalizedFloat64Bytes = hasFloat64Bytes
    ? normalizeMetric(float64Bytes, 'float64Bytes', true)
    : 0
  const operations = normalizeMetric(
    getRequestValue(request, 'operations', estimate),
    'operations'
  )
  const timeMs = normalizeMetric(
    getRequestValue(request, 'timeMs', estimate),
    'timeMs'
  )
  const operation = normalizeOperation(request.operation)
  const requestId = request.requestId === undefined
    ? null
    : request.requestId

  if (
    requestId !== null
    && typeof requestId !== 'string'
    && typeof requestId !== 'number'
  ) {
    throw invalidRequest(
      'Resource guard requestId must be a string or number when provided',
      { requestId }
    )
  }

  const scaledBytes = normalizedFloat64Bytes * policy.reservationMultiplier
  if (!Number.isFinite(scaledBytes)) {
    throw new ResourceGuardError(
      RESOURCE_GUARD_ERROR_CODES.OVERSIZE,
      'Resource guard request exceeds the configured capacity',
      {
        operation,
        requestId,
        float64Bytes: normalizedFloat64Bytes,
        reservedBytes: null,
        capacityBytes: policy.capacityBytes,
      }
    )
  }
  const reservedBytes = Math.ceil(scaledBytes)
  if (!Number.isSafeInteger(reservedBytes)) {
    throw new ResourceGuardError(
      RESOURCE_GUARD_ERROR_CODES.OVERSIZE,
      'Resource guard request exceeds the configured capacity',
      {
        operation,
        requestId,
        float64Bytes: normalizedFloat64Bytes,
        reservedBytes: null,
        capacityBytes: policy.capacityBytes,
      }
    )
  }

  return {
    operation,
    requestId,
    float64Bytes: normalizedFloat64Bytes,
    reservedBytes,
    operations,
    timeMs,
    signal: normalizeSignal(request.signal),
    estimateAvailable: hasFloat64Bytes,
  }
}

function getPlanEstimates(plan) {
  if (!isObject(plan)) {
    throw invalidRequest('Resource guard plan must be an object')
  }
  if (plan.estimates === undefined || plan.estimates === null) {
    return null
  }
  if (!isObject(plan.estimates)) {
    throw invalidRequest('Resource guard plan.estimates must be an object')
  }
  return plan.estimates
}

export function extractPlanResourceMetadata(plan, options = {}) {
  if (!isObject(options)) {
    throw invalidRequest('Resource guard plan options must be an object')
  }
  const estimates = getPlanEstimates(plan)
  const operation = options.operation ?? plan.operation
  const metadata = {
    operation,
    requestId: options.requestId,
    operations: estimates?.operations,
    timeMs: estimates?.timeMs,
    estimateAvailable: estimates !== null
      && hasOwn(estimates, 'float64Bytes'),
    signal: options.signal,
  }
  if (metadata.estimateAvailable) {
    metadata.float64Bytes = estimates.float64Bytes
  }
  return metadata
}

function createAbortError(entry) {
  return new ResourceGuardAbortError(
    'The resource guard request was aborted while waiting',
    {
      operation: entry.operation,
      requestId: entry.requestId,
      float64Bytes: entry.float64Bytes,
      reservedBytes: entry.reservedBytes,
    }
  )
}

function copyMetadata(metadata, state) {
  return Object.freeze({
    operation: metadata.operation,
    requestId: metadata.requestId,
    float64Bytes: metadata.float64Bytes,
    reservedBytes: metadata.reservedBytes,
    operations: metadata.operations,
    timeMs: metadata.timeMs,
    estimateAvailable: metadata.estimateAvailable,
    state,
  })
}

export class ResourceGuard {
  #policy
  #reservedBytes = 0
  #activeLeases = new Set()
  #queue = []

  constructor(policy = {}) {
    this.#policy = normalizePolicy(policy)
  }

  get policy() {
    return this.#policy
  }

  acquireForPlan(plan, options = {}) {
    try {
      return this.#acquire(extractPlanResourceMetadata(plan, options))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  acquirePlan(plan, options = {}) {
    return this.acquireForPlan(plan, options)
  }

  acquire(request = {}) {
    const result = this.#acquire(request)
    return result && typeof result.then === 'function'
      ? result
      : Promise.resolve(result)
  }

  acquireLease(request = {}) {
    return this.#acquire(request)
  }

  #acquire(request = {}) {
    let metadata
    try {
      metadata = normalizeRequest(request, this.#policy)
    } catch (error) {
      return Promise.reject(error)
    }

    if (metadata.reservedBytes > this.#policy.capacityBytes) {
      return Promise.reject(new ResourceGuardError(
        RESOURCE_GUARD_ERROR_CODES.OVERSIZE,
        'Resource guard request exceeds the configured capacity',
        {
          operation: metadata.operation,
          requestId: metadata.requestId,
          float64Bytes: metadata.float64Bytes,
          reservedBytes: metadata.reservedBytes,
          capacityBytes: this.#policy.capacityBytes,
        }
      ))
    }

    if (metadata.signal?.aborted) {
      return Promise.reject(new ResourceGuardAbortError(
        'The resource guard request was already aborted',
        {
          operation: metadata.operation,
          requestId: metadata.requestId,
          float64Bytes: metadata.float64Bytes,
          reservedBytes: metadata.reservedBytes,
        }
      ))
    }

    if (this.#queue.length === 0 && this.#canAdmit(metadata.reservedBytes)) {
      return this.#admit(metadata)
    }

    if (this.#queue.length >= this.#policy.maxQueued) {
      return Promise.reject(new ResourceGuardError(
        RESOURCE_GUARD_ERROR_CODES.QUEUE_FULL,
        'Resource guard queue is full',
        {
          operation: metadata.operation,
          requestId: metadata.requestId,
          float64Bytes: metadata.float64Bytes,
          reservedBytes: metadata.reservedBytes,
          capacityBytes: this.#policy.capacityBytes,
          activeCount: this.#activeLeases.size,
          queuedCount: this.#queue.length,
          maxQueued: this.#policy.maxQueued,
        }
      ))
    }

    return new Promise((resolve, reject) => {
      const entry = {
        ...metadata,
        state: 'queued',
        resolve,
        reject,
        removeAbortListener: null,
      }
      const onAbort = () => {
        if (entry.state !== 'queued') {
          return
        }
        this.#removeQueuedEntry(entry)
        entry.state = 'aborted'
        entry.removeAbortListener?.()
        entry.reject(createAbortError(entry))
        this.#drain()
      }

      if (metadata.signal) {
        entry.removeAbortListener = () => {
          metadata.signal.removeEventListener('abort', onAbort)
        }
        metadata.signal.addEventListener('abort', onAbort, { once: true })
      }

      if (metadata.signal?.aborted) {
        onAbort()
        return
      }

      this.#queue.push(entry)
      this.#drain()
    })
  }

  snapshot() {
    return {
      capacityBytes: this.#policy.capacityBytes,
      maxActive: this.#policy.maxActive,
      maxQueued: this.#policy.maxQueued,
      reservationMultiplier: this.#policy.reservationMultiplier,
      reservedBytes: this.#reservedBytes,
      availableBytes: Math.max(0, this.#policy.capacityBytes - this.#reservedBytes),
      activeCount: this.#activeLeases.size,
      queuedCount: this.#queue.length,
      active: Array.from(this.#activeLeases, (entry) =>
        copyMetadata(entry, 'active')),
      queued: this.#queue.map((entry) => copyMetadata(entry, 'queued')),
    }
  }

  getSnapshot() {
    return this.snapshot()
  }

  diagnostics() {
    return this.snapshot()
  }

  #canAdmit(reservedBytes) {
    return this.#activeLeases.size < this.#policy.maxActive
      && this.#reservedBytes + reservedBytes <= this.#policy.capacityBytes
  }

  #admit(metadata) {
    const entry = {
      ...metadata,
      state: 'active',
      admittedAt: Date.now(),
      resolve: null,
      reject: null,
      removeAbortListener: null,
    }
    this.#reservedBytes += metadata.reservedBytes
    this.#activeLeases.add(entry)

    let released = false
    const lease = {
      metadata: copyMetadata(entry, 'active'),
      get released() {
        return released
      },
      release: () => {
        if (released) {
          return false
        }
        released = true
        entry.state = 'released'
        this.#activeLeases.delete(entry)
        this.#reservedBytes -= entry.reservedBytes
        if (this.#reservedBytes < 0) {
          this.#reservedBytes = 0
        }
        this.#drain()
        return true
      },
    }
    return lease
  }

  #removeQueuedEntry(entry) {
    const index = this.#queue.indexOf(entry)
    if (index >= 0) {
      this.#queue.splice(index, 1)
    }
  }

  #drain() {
    while (this.#queue.length > 0) {
      const entry = this.#queue[0]
      if (entry.state !== 'queued') {
        this.#queue.shift()
        continue
      }
      if (entry.signal?.aborted) {
        this.#queue.shift()
        entry.state = 'aborted'
        entry.removeAbortListener?.()
        entry.reject(createAbortError(entry))
        continue
      }
      if (!this.#canAdmit(entry.reservedBytes)) {
        return
      }
      this.#queue.shift()
      entry.state = 'active'
      entry.removeAbortListener?.()
      const lease = this.#admit(entry)
      entry.resolve(lease)
    }
  }
}

export function createResourceGuard(policy = {}) {
  return new ResourceGuard(policy)
}
