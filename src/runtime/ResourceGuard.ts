import type {
  ResourceGuard as ResourceGuardContract,
  ResourceGuardAbortSignal,
  ResourceGuardAcquireOptions,
  ResourceGuardPolicy,
  ResourceGuardPolicyInput,
  ResourceGuardRequest,
  ResourceGuardSnapshot,
  ResourceLease,
  ResourceLeaseMetadata,
  ResourceLeaseResult,
  ResourceReservationEstimate,
  ResourceReservationPlan,
} from './ResourceGuardTypes'

const BYTES_PER_MIB = 1024 * 1024

export const RESOURCE_GUARD_ERROR_CODES = Object.freeze({
  INVALID_POLICY: 'invalid-policy',
  INVALID_REQUEST: 'invalid-request',
  OVERSIZE: 'oversize',
  QUEUE_FULL: 'queue-full',
  ABORTED: 'aborted',
} as const)

export const DEFAULT_RESOURCE_GUARD_POLICY: Readonly<ResourceGuardPolicy> =
  Object.freeze({
    capacityBytes: 64 * BYTES_PER_MIB,
    maxActive: 4,
    maxQueued: 32,
    reservationMultiplier: 1.5,
  })

type UnknownRecord = Record<string, unknown>

type NormalizedResourceRequest = {
  readonly operation: string
  readonly requestId: string | number | null
  readonly float64Bytes: number
  readonly reservedBytes: number
  readonly signal: ResourceGuardAbortSignal | null
  readonly estimateAvailable: boolean
}

interface ActiveEntry extends NormalizedResourceRequest {
  state: 'active' | 'released'
  admittedAt: number
}

interface QueuedEntry extends NormalizedResourceRequest {
  state: 'queued' | 'aborted' | 'active'
  resolve: (lease: ResourceLease) => void
  reject: (reason?: unknown) => void
  removeAbortListener: (() => void) | null
}

export interface ResourceGuardErrorShape {
  readonly resourceGuard: true
  readonly code: string
}

export class ResourceGuardError extends Error
  implements ResourceGuardErrorShape {
  readonly code: string
  readonly resourceGuard = true as const
  readonly details: Readonly<UnknownRecord>

  constructor(code: string, message: string, details: UnknownRecord = {}) {
    super(message)
    this.name = 'ResourceGuardError'
    this.code = code
    this.details = createDetails(details)
  }
}

export class ResourceGuardAbortError extends ResourceGuardError {
  constructor(
    message = 'The resource guard request was aborted',
    details: UnknownRecord = {},
  ) {
    super(RESOURCE_GUARD_ERROR_CODES.ABORTED, message, details)
    this.name = 'AbortError'
  }
}

function hasOwn(object: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function createDetails(details: UnknownRecord): Readonly<UnknownRecord> {
  return Object.freeze({ ...details })
}

export function isResourceGuardError(
  error: unknown,
): error is ResourceGuardErrorShape {
  return isObject(error)
    && error.resourceGuard === true
    && typeof error.code === 'string'
}

export function isResourceGuardAbortError(
  error: unknown,
): error is ResourceGuardErrorShape & {
  readonly code: typeof RESOURCE_GUARD_ERROR_CODES.ABORTED
} {
  return isResourceGuardError(error)
    && error.code === RESOURCE_GUARD_ERROR_CODES.ABORTED
}

function getPolicyValue(
  policy: ResourceGuardPolicyInput,
  key: keyof ResourceGuardPolicy,
): number | undefined {
  if (hasOwn(policy, key)) {
    return policy[key]
  }
  return DEFAULT_RESOURCE_GUARD_POLICY[key]
}

function invalidPolicy(
  message: string,
  details: UnknownRecord = {},
): ResourceGuardError {
  return new ResourceGuardError(
    RESOURCE_GUARD_ERROR_CODES.INVALID_POLICY,
    message,
    details,
  )
}

function normalizePolicy(
  policy: ResourceGuardPolicyInput = {},
): ResourceGuardPolicy {
  if (!isObject(policy)) {
    throw invalidPolicy('Resource guard policy must be an object')
  }

  const capacityBytes = getPolicyValue(policy, 'capacityBytes')
  const maxActive = getPolicyValue(policy, 'maxActive')
  const maxQueued = getPolicyValue(policy, 'maxQueued')
  const reservationMultiplier = getPolicyValue(
    policy,
    'reservationMultiplier',
  )

  if (
    typeof capacityBytes !== 'number'
    || !Number.isFinite(capacityBytes)
    || capacityBytes <= 0
  ) {
    throw invalidPolicy(
      'Resource guard capacityBytes must be a finite positive number',
      { capacityBytes },
    )
  }
  if (
    typeof maxActive !== 'number'
    || !Number.isSafeInteger(maxActive)
    || maxActive < 1
  ) {
    throw invalidPolicy(
      'Resource guard maxActive must be a positive safe integer',
      { maxActive },
    )
  }
  if (
    typeof maxQueued !== 'number'
    || !Number.isSafeInteger(maxQueued)
    || maxQueued < 0
  ) {
    throw invalidPolicy(
      'Resource guard maxQueued must be a non-negative safe integer',
      { maxQueued },
    )
  }
  if (
    typeof reservationMultiplier !== 'number'
    || !Number.isFinite(reservationMultiplier)
    || reservationMultiplier <= 0
  ) {
    throw invalidPolicy(
      'Resource guard reservationMultiplier must be a finite positive number',
      { reservationMultiplier },
    )
  }

  return Object.freeze({
    capacityBytes,
    maxActive,
    maxQueued,
    reservationMultiplier,
  })
}

function invalidRequest(
  message: string,
  details: UnknownRecord = {},
): ResourceGuardError {
  return new ResourceGuardError(
    RESOURCE_GUARD_ERROR_CODES.INVALID_REQUEST,
    message,
    details,
  )
}

function normalizeMetric(
  value: unknown,
  name: string,
  required = false,
): number | null {
  if (value === undefined || value === null) {
    if (required) {
      throw invalidRequest(
        `Resource guard ${name} must be a finite non-negative number`,
        { [name]: value },
      )
    }
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw invalidRequest(
      `Resource guard ${name} must be a finite non-negative number`,
      { [name]: value },
    )
  }
  return value
}

function getRequestValue(
  request: UnknownRecord,
  key: 'float64Bytes',
  estimate: UnknownRecord | null,
): unknown {
  if (hasOwn(request, key)) {
    return request[key]
  }
  if (estimate && hasOwn(estimate, key)) {
    return estimate[key]
  }
  return undefined
}

function normalizeSignal(signal: unknown): ResourceGuardAbortSignal | null {
  if (signal === undefined || signal === null) {
    return null
  }
  if (
    !isObject(signal)
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw invalidRequest('Resource guard signal must be an AbortSignal-like object')
  }
  return signal as unknown as ResourceGuardAbortSignal
}

function normalizeOperation(operation: unknown): string {
  if (operation === undefined || operation === null) {
    return 'calculation'
  }
  if (typeof operation !== 'string' || operation.length === 0) {
    throw invalidRequest('Resource guard operation must be a non-empty string')
  }
  return operation
}

function normalizeRequest(
  request: unknown,
  policy: ResourceGuardPolicy,
): NormalizedResourceRequest {
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
      { requestId },
    )
  }

  const scaledBytes = (normalizedFloat64Bytes ?? 0)
    * policy.reservationMultiplier
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
      },
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
      },
    )
  }

  return {
    operation,
    requestId,
    float64Bytes: normalizedFloat64Bytes ?? 0,
    reservedBytes,
    signal: normalizeSignal(request.signal),
    estimateAvailable: hasFloat64Bytes,
  }
}

function getPlanEstimates(
  plan: ResourceReservationPlan | unknown,
): ResourceReservationEstimate | null {
  if (!isObject(plan)) {
    throw invalidRequest('Resource guard plan must be an object')
  }
  if (plan.estimates === undefined || plan.estimates === null) {
    return null
  }
  if (!isObject(plan.estimates)) {
    throw invalidRequest('Resource guard plan.estimates must be an object')
  }
  return plan.estimates as ResourceReservationEstimate
}

export function extractPlanResourceMetadata(
  plan: ResourceReservationPlan,
  options: ResourceGuardAcquireOptions = {},
): ResourceGuardRequest {
  if (!isObject(options as unknown)) {
    throw invalidRequest('Resource guard plan options must be an object')
  }
  const estimates = getPlanEstimates(plan)
  const operation = options.operation ?? plan.operation
  const metadata = {
    operation,
    requestId: options.requestId,
    estimateAvailable: estimates !== null
      && hasOwn(estimates, 'float64Bytes'),
    signal: options.signal,
    ...(estimates !== null && hasOwn(estimates, 'float64Bytes')
      ? { float64Bytes: estimates.float64Bytes }
      : {}),
  }
  return metadata
}

function createAbortError(
  entry: NormalizedResourceRequest,
): ResourceGuardAbortError {
  return new ResourceGuardAbortError(
    'The resource guard request was aborted while waiting',
    {
      operation: entry.operation,
      requestId: entry.requestId,
      float64Bytes: entry.float64Bytes,
      reservedBytes: entry.reservedBytes,
    },
  )
}

function copyMetadata(
  metadata: NormalizedResourceRequest,
  state: ResourceLeaseMetadata['state'],
): ResourceLeaseMetadata {
  return Object.freeze({
    operation: metadata.operation,
    requestId: metadata.requestId,
    float64Bytes: metadata.float64Bytes,
    reservedBytes: metadata.reservedBytes,
    estimateAvailable: metadata.estimateAvailable,
    state,
  })
}

function isPromiseLike<T>(
  value: ResourceLease | Promise<T>,
): value is Promise<T> {
  return typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof (value as { readonly then?: unknown }).then === 'function'
}

export class ResourceGuard implements ResourceGuardContract {
  #policy: ResourceGuardPolicy
  #reservedBytes = 0
  #activeLeases: Set<ActiveEntry> = new Set()
  #queue: QueuedEntry[] = []

  constructor(policy: ResourceGuardPolicyInput = {}) {
    this.#policy = normalizePolicy(policy)
  }

  get policy(): ResourceGuardPolicy {
    return this.#policy
  }

  acquireForPlan(
    plan: ResourceReservationPlan,
    options: ResourceGuardAcquireOptions = {},
  ): ResourceLeaseResult {
    try {
      return this.#acquire(extractPlanResourceMetadata(plan, options))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  acquire(request: ResourceGuardRequest = {}): Promise<ResourceLease> {
    const result = this.#acquire(request)
    return isPromiseLike(result)
      ? result
      : Promise.resolve(result)
  }

  acquireLease(
    request: ResourceGuardRequest = {},
  ): ResourceLeaseResult {
    return this.#acquire(request)
  }

  #acquire(request: ResourceGuardRequest = {}): ResourceLeaseResult {
    let metadata: NormalizedResourceRequest
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
        },
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
        },
      ))
    }

    if (
      this.#queue.length === 0
      && this.#canAdmit(metadata.reservedBytes)
    ) {
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
        },
      ))
    }

    return new Promise<ResourceLease>((resolve, reject) => {
      const entry: QueuedEntry = {
        ...metadata,
        state: 'queued',
        resolve,
        reject,
        removeAbortListener: null,
      }
      const onAbort = (_event?: Event): void => {
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
          metadata.signal?.removeEventListener('abort', onAbort)
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

  snapshot(): ResourceGuardSnapshot {
    return {
      capacityBytes: this.#policy.capacityBytes,
      maxActive: this.#policy.maxActive,
      maxQueued: this.#policy.maxQueued,
      reservationMultiplier: this.#policy.reservationMultiplier,
      reservedBytes: this.#reservedBytes,
      availableBytes: Math.max(
        0,
        this.#policy.capacityBytes - this.#reservedBytes,
      ),
      activeCount: this.#activeLeases.size,
      queuedCount: this.#queue.length,
      active: Array.from(this.#activeLeases, (entry) =>
        copyMetadata(entry, 'active')),
      queued: this.#queue.map((entry) => copyMetadata(entry, 'queued')),
    }
  }

  #canAdmit(reservedBytes: number): boolean {
    return this.#activeLeases.size < this.#policy.maxActive
      && this.#reservedBytes + reservedBytes <= this.#policy.capacityBytes
  }

  #admit(metadata: NormalizedResourceRequest): ResourceLease {
    const entry: ActiveEntry = {
      ...metadata,
      state: 'active',
      admittedAt: Date.now(),
    }
    this.#reservedBytes += metadata.reservedBytes
    this.#activeLeases.add(entry)

    let released = false
    const lease: ResourceLease = {
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

  #removeQueuedEntry(entry: QueuedEntry): void {
    const index = this.#queue.indexOf(entry)
    if (index >= 0) {
      this.#queue.splice(index, 1)
    }
  }

  #drain(): void {
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

export function createResourceGuard(
  policy: ResourceGuardPolicyInput = {},
): ResourceGuardContract {
  return new ResourceGuard(policy)
}
