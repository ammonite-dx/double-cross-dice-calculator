export const CALCULATION_REQUEST_STATUS = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  RESOURCE_REJECTED: 'resource-rejected',
})

function isAbortSignal(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.aborted === 'boolean'
    && typeof value.addEventListener === 'function'
    && typeof value.removeEventListener === 'function'
}

function cloneRequestValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (isAbortSignal(value)) {
    return value
  }
  if (seen.has(value)) {
    return seen.get(value)
  }
  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags)
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0)
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      return new DataView(value.buffer.slice(0))
    }
    return new value.constructor(value)
  }
  if (value instanceof Map) {
    const clone = new Map()
    seen.set(value, clone)
    for (const [key, entry] of value.entries()) {
      clone.set(
        cloneRequestValue(key, seen),
        cloneRequestValue(entry, seen)
      )
    }
    return clone
  }
  if (value instanceof Set) {
    const clone = new Set()
    seen.set(value, clone)
    for (const entry of value.values()) {
      clone.add(cloneRequestValue(entry, seen))
    }
    return clone
  }
  if (typeof value.then === 'function') {
    return value
  }

  const clone = Array.isArray(value) ? [] : {}
  seen.set(value, clone)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable) {
      continue
    }
    clone[key] = cloneRequestValue(value[key], seen)
  }
  return clone
}

function defaultSnapshotRequest(request) {
  return cloneRequestValue(request)
}

function combineAbortSignals(externalSignal, internalSignal) {
  const signals = [externalSignal, internalSignal].filter(Boolean)
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
  const cleanup = []
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

function isAbortError(error) {
  return error?.name === 'AbortError'
}

function isResourceRejectedError(error) {
  return error?.resourceGuard === true
    || error?.name === 'ResourceGuardError'
    || error?.code === 'RESOURCE_GUARD_ERROR'
    || error?.code === 'oversize'
    || error?.code === 'queue-full'
}

/**
 * Coordinates one request lane. A lane has at most one started request and
 * one not-yet-started request. The request snapshot is made when run() is
 * called, so a queued request cannot observe later mutations of its input.
 *
 * execute(snapshot, context) receives the immutable-by-convention request
 * snapshot. context contains revision, signal, options, and onRangePlan.
 */
export function createCalculationRequestCoordinator({
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
}) {
  if (typeof execute !== 'function') {
    throw new TypeError('createCalculationRequestCoordinator requires execute')
  }

  let revision = 0
  let disposed = false
  let active = null
  let queued = null
  let state = {
    status: CALCULATION_REQUEST_STATUS.IDLE,
    revision: 0,
    activeRevision: null,
    queuedRevision: null,
    disposed: false,
  }

  function getSnapshot() {
    return {
      status: state.status,
      revision: state.revision,
      activeRevision: state.activeRevision,
      queuedRevision: state.queuedRevision,
      disposed: state.disposed,
    }
  }

  function publishState(nextStatus) {
    state = {
      status: nextStatus,
      revision,
      activeRevision: active?.revision ?? null,
      queuedRevision: queued?.revision ?? null,
      disposed,
    }
    onStateChange?.(getSnapshot())
  }

  function settle(item, value) {
    if (item.settled) {
      return
    }
    item.settled = true
    item.resolve(value)
  }

  function cleanupItem(item) {
    item.externalAbortCleanup?.()
    item.externalAbortCleanup = null
  }

  function isCurrent(item) {
    return !disposed && item.revision === revision
  }

  function cancelQueuedItem(item) {
    if (item === null || item === undefined || queued !== item) {
      return
    }
    queued = null
    cleanupItem(item)
    settle(item, false)
  }

  function invalidateLatest() {
    revision += 1
    if (active?.controller) {
      active.controller.abort()
    }
    if (active !== null) {
      settle(active, false)
    }
    cancelQueuedItem(queued)
    publishState(CALCULATION_REQUEST_STATUS.CANCELLED)
  }

  function handleExternalAbort(item) {
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
        onCancelled?.({
          revision: item.revision,
          request: item.snapshot,
          signal: item.signal,
          options: item.options,
        })
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
      onCancelled?.({
        revision: item.revision,
        request: item.snapshot,
        signal: item.signal,
        options: item.options,
      })
    }
  }

  function createContext(item) {
    const context = {
      revision: item.revision,
      request: item.snapshot,
      signal: item.signal,
      options: item.options,
      onRangePlan: (plan) => {
        if (!isCurrent(item)) {
          return
        }
        onPlan?.(plan, context)
        item.options.onRangePlan?.(plan)
      },
    }
    return context
  }

  function start(item) {
    if (disposed || item.externalAborted) {
      finish(item, {
        kind: 'cancelled',
        value: false,
      })
      return
    }

    publishState(CALCULATION_REQUEST_STATUS.RUNNING)
    const context = createContext(item)
    let execution
    try {
      execution = execute(item.snapshot, context)
    } catch (error) {
      finish(item, { kind: 'error', value: error, context })
      return
    }
    Promise.resolve(execution)
      .then(
        (result) => finish(item, { kind: 'success', value: result, context }),
        (error) => finish(item, { kind: 'error', value: error, context })
      )
  }

  function startQueuedIfNeeded() {
    if (disposed || active !== null || queued === null) {
      return
    }
    active = queued
    queued = null
    start(active)
  }

  function finish(item, outcome) {
    if (active !== item) {
      return
    }

    const current = isCurrent(item)
    active = null
    cleanupItem(item)

    if (!current) {
      // Superseded work is allowed to finish, but it cannot publish anything.
      // Abort after completion to release listeners without asking the
      // underlying calculation to stop while it is still running.
      item.controller?.abort()
      settle(item, false)
      startQueuedIfNeeded()
      return
    }

    if (outcome.kind === 'success') {
      try {
        const committed = commit?.(outcome.value, outcome.context)
        if (!isCurrent(item)) {
          // A commit may synchronously enqueue/start a newer request (for
  // example, when a result requests an extended range).
          // The newer request owns feedback and lifecycle notifications now;
          // never let this superseded finish publish SUCCESS/onCommitted.
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
        } catch (error) {
          if (!isCurrent(item)) {
            // The commit itself may have started a newer request and then
            // failed. Its error must not replace the newer request's loading
            // state either.
            settle(item, false)
            return
          }
          publishState(
            isResourceRejected(error)
            ? CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED
            : CALCULATION_REQUEST_STATUS.ERROR
        )
        onError?.(error, outcome.context)
        settle(item, false)
      }
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
        : CALCULATION_REQUEST_STATUS.ERROR
    )
    onError?.(error, outcome.context)
    settle(item, false)
  }

  function run(request, options = {}) {
    if (disposed) {
      return Promise.resolve(false)
    }
    const itemRevision = ++revision
    let snapshot
    try {
      snapshot = snapshotRequest(request)
    } catch (error) {
      publishState(
        isResourceRejected(error)
          ? CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED
          : CALCULATION_REQUEST_STATUS.ERROR
      )
      onError?.(error, { revision: itemRevision, request, options })
      return Promise.resolve(false)
    }

    let resolve
    const promise = new Promise((resolvePromise) => {
      resolve = resolvePromise
    })
    const internalController = typeof AbortController === 'function'
      ? new AbortController()
      : null
    const externalSignal = options?.signal
    const item = {
      revision: itemRevision,
      snapshot,
      options: options ?? {},
      controller: internalController,
      signal: combineAbortSignals(externalSignal, internalController?.signal),
      resolve,
      settled: false,
      externalAborted: externalSignal?.aborted === true,
      externalAbortCleanup: null,
    }

    onStart?.(snapshot, {
      revision: item.revision,
      request: item.snapshot,
      signal: item.signal,
      options: item.options,
    })

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
        onCancelled?.({
          revision: item.revision,
          request: item.snapshot,
          signal: item.signal,
          options: item.options,
        })
        settle(item, false)
      }
      return promise
    }

    if (active !== null) {
      cancelQueuedItem(queued)
      queued = item
      publishState(CALCULATION_REQUEST_STATUS.PENDING)
      return promise
    }

    active = item
    start(item)
    return promise
  }

  function invalidate() {
    invalidateLatest()
    onCancelled?.({ revision, request: null, signal: null, options: {} })
  }

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true
    revision += 1
    if (active?.controller) {
      active.controller.abort()
    }
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

export const createLatestRequestCoordinator =
  createCalculationRequestCoordinator
