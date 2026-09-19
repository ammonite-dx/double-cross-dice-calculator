import type {
  CalculationCancellationContext,
  CalculationCoordinatorOptions,
  CalculationCoordinatorOptionsValue,
  CalculationCoordinatorState,
  CalculationRequestContext,
  CalculationRequestCoordinator,
  CalculationRequestStatus,
  CalculationRunnerContext,
  CalculationSnapshotErrorContext,
} from './CalculationFeedbackTypes'
import type { CalculationRangePlan } from '../calculation/planning/RangePlannerTypes'

export const CALCULATION_REQUEST_STATUS = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  RESOURCE_REJECTED: 'resource-rejected',
} as const)

type CoordinatorOptions<TPlan, TOptions extends object> =
  CalculationCoordinatorOptionsValue<TPlan, TOptions>

type RequestItem<
  TRequest,
  TPlan,
  TOptions extends object,
> = {
  readonly revision: number
  readonly snapshot: TRequest
  readonly options: CoordinatorOptions<TPlan, TOptions>
  readonly controller: AbortController | null
  readonly signal: AbortSignal | null | undefined
  readonly resolve: (value: boolean) => void
  settled: boolean
  externalAborted: boolean
  externalAbortCleanup: (() => void) | null
}

type SuccessOutcome<TResult, TRequest, TPlan, TOptions extends object> = {
  readonly kind: 'success'
  readonly value: TResult
  readonly context: CalculationRunnerContext<TRequest, TPlan, TOptions>
}

type ErrorOutcome<TRequest, TPlan, TOptions extends object> = {
  readonly kind: 'error'
  readonly value: unknown
  readonly context: CalculationRunnerContext<TRequest, TPlan, TOptions>
}

type CancelledOutcome = {
  readonly kind: 'cancelled'
  readonly value: false
}

type ExecutionOutcome<TResult, TRequest, TPlan, TOptions extends object> =
  | SuccessOutcome<TResult, TRequest, TPlan, TOptions>
  | ErrorOutcome<TRequest, TPlan, TOptions>
  | CancelledOutcome

function isAbortSignal(value: unknown): value is AbortSignal {
  return value !== null
    && typeof value === 'object'
    && typeof Reflect.get(value, 'aborted') === 'boolean'
    && typeof Reflect.get(value, 'addEventListener') === 'function'
    && typeof Reflect.get(value, 'removeEventListener') === 'function'
}

function cloneRequestValue<T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (isAbortSignal(value)) {
    return value
  }
  if (seen.has(value)) {
    return seen.get(value) as T
  }
  if (value instanceof Date) {
    const clone = new Date(value.getTime())
    seen.set(value, clone)
    return clone as T
  }
  if (value instanceof RegExp) {
    const clone = new RegExp(value.source, value.flags)
    seen.set(value, clone)
    return clone as T
  }
  if (value instanceof ArrayBuffer) {
    const clone = value.slice(0)
    seen.set(value, clone)
    return clone as T
  }
  if (ArrayBuffer.isView(value)) {
    const buffer = value.buffer.slice(0)
    const clone = value instanceof DataView
      ? new DataView(buffer, value.byteOffset, value.byteLength)
      : Reflect.construct(
        value.constructor,
        [buffer, value.byteOffset, Reflect.get(value, 'length')],
      )
    seen.set(value, clone)
    return clone as T
  }
  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>()
    seen.set(value, clone)
    for (const [key, entry] of value.entries()) {
      clone.set(
        cloneRequestValue(key, seen),
        cloneRequestValue(entry, seen),
      )
    }
    return clone as T
  }
  if (value instanceof Set) {
    const clone = new Set<unknown>()
    seen.set(value, clone)
    for (const entry of value.values()) {
      clone.add(cloneRequestValue(entry, seen))
    }
    return clone as T
  }

  const then = Reflect.get(value, 'then')
  if (typeof then === 'function') {
    return value
  }

  const clone: unknown[] | Record<PropertyKey, unknown> = Array.isArray(value)
    ? []
    : {}
  seen.set(value, clone)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable) {
      continue
    }
    Reflect.set(clone, key, cloneRequestValue(Reflect.get(value, key), seen))
  }
  return clone as T
}

function defaultSnapshotRequest<TRequest>(request: TRequest): TRequest {
  return cloneRequestValue(request)
}

function combineAbortSignals(
  externalSignal: AbortSignal | null | undefined,
  internalSignal: AbortSignal | null | undefined,
): AbortSignal | null | undefined {
  const signals = [externalSignal, internalSignal].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  )
  if (signals.length <= 1) {
    return signals[0]
  }
  if (
    typeof AbortSignal !== 'undefined'
    && typeof AbortSignal.any === 'function'
  ) {
    return AbortSignal.any(signals)
  }
  if (typeof AbortController !== 'function') {
    return externalSignal ?? internalSignal
  }

  const controller = new AbortController()
  const cleanup: Array<() => void> = []
  const abort = () => {
    for (const removeListener of cleanup.splice(0)) {
      removeListener()
    }
    controller.abort()
  }
  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      break
    }
    const listener = () => abort()
    signal.addEventListener('abort', listener, { once: true })
    cleanup.push(() => signal.removeEventListener('abort', listener))
  }
  return controller.signal
}

function isAbortError(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && Reflect.get(error, 'name') === 'AbortError'
}

function isResourceRejectedError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false
  }
  return Reflect.get(error, 'resourceGuard') === true
    || Reflect.get(error, 'name') === 'ResourceGuardError'
    || Reflect.get(error, 'code') === 'RESOURCE_GUARD_ERROR'
    || Reflect.get(error, 'code') === 'oversize'
    || Reflect.get(error, 'code') === 'queue-full'
}

/**
 * Coordinates one request lane. A lane has at most one started request and
 * one not-yet-started request. The request snapshot is made when run() is
 * called, so a queued request cannot observe later mutations of its input.
 */
export function createCalculationRequestCoordinator<
  TRequest,
  TResult,
  TPlan = CalculationRangePlan,
  TOptions extends object = Record<string, unknown>,
>({
  execute,
  snapshotRequest = defaultSnapshotRequest,
  commit,
  onStart,
  onPlan,
  onCommitted,
  onError,
  onCancelled,
  onStateChange,
  isResourceRejected = isResourceRejectedError,
}: CalculationCoordinatorOptions<TRequest, TResult, TPlan, TOptions>):
  CalculationRequestCoordinator<TRequest, TResult, TPlan, TOptions> {
  if (typeof execute !== 'function') {
    throw new TypeError('createCalculationRequestCoordinator requires execute')
  }

  let revision = 0
  let disposed = false
  let active: RequestItem<TRequest, TPlan, TOptions> | null = null
  let queued: RequestItem<TRequest, TPlan, TOptions> | null = null
  let state: CalculationCoordinatorState = {
    status: CALCULATION_REQUEST_STATUS.IDLE,
    revision: 0,
    activeRevision: null,
    queuedRevision: null,
    disposed: false,
  }

  function getSnapshot(): CalculationCoordinatorState {
    return {
      status: state.status,
      revision: state.revision,
      activeRevision: state.activeRevision,
      queuedRevision: state.queuedRevision,
      disposed: state.disposed,
    }
  }

  function publishState(nextStatus: CalculationRequestStatus): void {
    state = {
      status: nextStatus,
      revision,
      activeRevision: active?.revision ?? null,
      queuedRevision: queued?.revision ?? null,
      disposed,
    }
    onStateChange?.(getSnapshot())
  }

  function settle(
    item: RequestItem<TRequest, TPlan, TOptions>,
    value: boolean,
  ): void {
    if (item.settled) {
      return
    }
    item.settled = true
    item.resolve(value)
  }

  function cleanupItem(item: RequestItem<TRequest, TPlan, TOptions>): void {
    item.externalAbortCleanup?.()
    item.externalAbortCleanup = null
  }

  function isCurrent(item: RequestItem<TRequest, TPlan, TOptions>): boolean {
    return !disposed && item.revision === revision
  }

  function createRequestContext(
    item: RequestItem<TRequest, TPlan, TOptions>,
  ): CalculationRequestContext<TRequest, TPlan, TOptions> {
    return {
      revision: item.revision,
      request: item.snapshot,
      signal: item.signal,
      options: item.options,
    }
  }

  function createRunnerContext(
    item: RequestItem<TRequest, TPlan, TOptions>,
  ): CalculationRunnerContext<TRequest, TPlan, TOptions> {
    const context: CalculationRunnerContext<TRequest, TPlan, TOptions> = {
      ...createRequestContext(item),
      onRangePlan: (plan: TPlan) => {
        if (!isCurrent(item)) {
          return
        }
        onPlan?.(plan, context)
        item.options.onRangePlan?.(plan)
      },
    }
    return context
  }

  function cancelQueuedItem(
    item: RequestItem<TRequest, TPlan, TOptions> | null,
  ): void {
    if (item === null || queued !== item) {
      return
    }
    queued = null
    cleanupItem(item)
    settle(item, false)
  }

  function invalidateLatest(): void {
    revision += 1
    active?.controller?.abort()
    if (active !== null) {
      settle(active, false)
    }
    cancelQueuedItem(queued)
    publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
  }

  function handleExternalAbort(
    item: RequestItem<TRequest, TPlan, TOptions>,
  ): void {
    if (item.settled || disposed) {
      return
    }
    item.externalAborted = true
    if (active === item) {
      if (queued === null && item.revision === revision) {
        revision += 1
      }
      item.controller?.abort()
      settle(item, false)
      if (queued === null) {
        publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
        onCancelled?.(createRequestContext(item))
      } else {
        publishState(CALCULATION_REQUEST_STATUS.PENDING)
      }
      return
    }
    cancelQueuedItem(item)
    if (active !== null) {
      if (item.revision === revision) {
        revision += 1
      }
      publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
      onCancelled?.(createRequestContext(item))
    }
  }

  function start(item: RequestItem<TRequest, TPlan, TOptions>): void {
    if (disposed || item.externalAborted) {
      finish(item, { kind: 'cancelled', value: false })
      return
    }

    publishState(CALCULATION_REQUEST_STATUS.RUNNING)
    const context = createRunnerContext(item)
    let execution: TResult | Promise<TResult>
    try {
      execution = execute(item.snapshot, context)
    } catch (error) {
      finish(item, { kind: 'error', value: error, context })
      return
    }
    Promise.resolve(execution).then(
      (result) => finish(item, { kind: 'success', value: result, context }),
      (error: unknown) => finish(item, { kind: 'error', value: error, context }),
    )
  }

  function startQueuedIfNeeded(): void {
    if (disposed || active !== null || queued === null) {
      return
    }
    active = queued
    queued = null
    start(active)
  }

  function finish(
    item: RequestItem<TRequest, TPlan, TOptions>,
    outcome: ExecutionOutcome<TResult, TRequest, TPlan, TOptions>,
  ): void {
    if (active !== item) {
      return
    }

    const current = isCurrent(item)
    active = null
    cleanupItem(item)

    if (!current) {
      // Superseded work is signalled to abort when the newer request arrives.
      // If an executor ignores cancellation, its eventual completion still
      // cannot publish anything.
      item.controller?.abort()
      settle(item, false)
      startQueuedIfNeeded()
      return
    }

    if (outcome.kind === 'success') {
      try {
        const committed = commit?.(outcome.value, outcome.context)
        if (!isCurrent(item)) {
          // A commit may synchronously enqueue/start a newer request.
          settle(item, false)
          return
        }
        if (committed === false) {
          publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
          onCancelled?.(outcome.context)
          settle(item, false)
        } else {
          publishState(CALCULATION_REQUEST_STATUS.SUCCESS)
          onCommitted?.(outcome.value, outcome.context)
          settle(item, true)
        }
      } catch (error: unknown) {
        if (!isCurrent(item)) {
          settle(item, false)
          return
        }
        publishState(
          isResourceRejected(error)
            ? CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED
            : CALCULATION_REQUEST_STATUS.ERROR,
        )
        onError?.(error, outcome.context)
        settle(item, false)
      }
      return
    }

    if (outcome.kind === 'cancelled') {
      settle(item, false)
      return
    }

    const error = outcome.value
    if (isAbortError(error) || item.externalAborted || item.signal?.aborted) {
      publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
      onCancelled?.(outcome.context)
      settle(item, false)
      return
    }

    publishState(
      isResourceRejected(error)
        ? CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED
        : CALCULATION_REQUEST_STATUS.ERROR,
    )
    onError?.(error, outcome.context)
    settle(item, false)
  }

  function run(
    request: TRequest,
    options: CoordinatorOptions<TPlan, TOptions> = {} as CoordinatorOptions<TPlan, TOptions>,
  ): Promise<boolean> {
    if (disposed) {
      return Promise.resolve(false)
    }
    const itemRevision = ++revision
    const requestOptions = options ?? {}
    let snapshot: TRequest
    try {
      snapshot = snapshotRequest(request)
    } catch (error: unknown) {
      // The failed request still owns the newest revision. Stop stale work
      // before publishing the snapshot error.
      active?.controller?.abort()
      cancelQueuedItem(queued)
      publishState(
        isResourceRejected(error)
          ? CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED
          : CALCULATION_REQUEST_STATUS.ERROR,
      )
      const context: CalculationSnapshotErrorContext<TRequest, TPlan, TOptions> = {
        revision: itemRevision,
        request,
        options: requestOptions,
      }
      onError?.(error, context)
      return Promise.resolve(false)
    }

    let resolve!: (value: boolean) => void
    const promise = new Promise<boolean>((resolvePromise) => {
      resolve = resolvePromise
    })
    const internalController = typeof AbortController === 'function'
      ? new AbortController()
      : null
    const externalSignal = requestOptions.signal
    const item: RequestItem<TRequest, TPlan, TOptions> = {
      revision: itemRevision,
      snapshot,
      options: requestOptions,
      controller: internalController,
      signal: combineAbortSignals(externalSignal, internalController?.signal),
      resolve,
      settled: false,
      externalAborted: externalSignal?.aborted === true,
      externalAbortCleanup: null,
    }

    onStart?.(snapshot, createRequestContext(item))

    if (typeof externalSignal?.addEventListener === 'function') {
      const listener = () => handleExternalAbort(item)
      externalSignal.addEventListener('abort', listener, { once: true })
      item.externalAbortCleanup = () =>
        externalSignal.removeEventListener('abort', listener)
    }

    if (item.externalAborted || item.signal?.aborted) {
      handleExternalAbort(item)
      if (active !== item && queued !== item && !item.settled) {
        publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
        onCancelled?.(createRequestContext(item))
        settle(item, false)
      }
      return promise
    }

    if (active !== null) {
      // A newer request makes the running item stale immediately. Keep the
      // lane occupied until its Promise settles so requests never overlap.
      active.controller?.abort()
      cancelQueuedItem(queued)
      queued = item
      publishState(CALCULATION_REQUEST_STATUS.PENDING)
      return promise
    }

    active = item
    start(item)
    return promise
  }

  function invalidate(): void {
    invalidateLatest()
    onCancelled?.({ revision, request: null, signal: null, options: {} })
  }

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    revision += 1
    active?.controller?.abort()
    if (active !== null) {
      settle(active, false)
    }
    cancelQueuedItem(queued)
    publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
    onCancelled?.({ revision, request: null, signal: null, options: {} })
  }

  return {
    run,
    invalidate,
    dispose,
    snapshot: getSnapshot,
  }
}
