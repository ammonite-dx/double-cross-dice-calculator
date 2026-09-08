export const R19_WORKER_OPERATIONS = Object.freeze([
  'check',
  'attack',
  'totalDamage',
  'backtrack',
])

function createDefaultWorker() {
  if (typeof Worker !== 'function') {
    throw new Error('R19 worker benchmark requires the browser Worker API')
  }
  return new Worker(new URL('./calculation-worker.js', import.meta.url), {
    type: 'module',
  })
}

export function createAbortError(operation = 'Calculation') {
  const error = new Error(`${operation} calculation was aborted`)
  error.name = 'AbortError'
  return error
}

export function serializeError(error) {
  const serialized = {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  }
  if (typeof error?.code === 'string') {
    serialized.code = error.code
  }
  if (Array.isArray(error?.rejectionReasons)) {
    serialized.rejectionReasons = [...error.rejectionReasons]
  }
  if (error?.plan && typeof error.plan === 'object') {
    serialized.plan = error.plan
  }
  return serialized
}

function isPromiseLike(value) {
  return value !== null
    && value !== undefined
    && typeof value.then === 'function'
}

function normalizeOperation(operation) {
  if (!R19_WORKER_OPERATIONS.includes(operation)) {
    throw new TypeError(
      `operation must be one of: ${R19_WORKER_OPERATIONS.join(', ')}`
    )
  }
  return operation
}

function copyOptions(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('worker calculation options must be an object')
  }
  const { signal, onRangePlan, onUnderlyingSettled, ...cloneable } = options
  return {
    cloneable,
    signal,
    onRangePlan,
    onUnderlyingSettled,
  }
}

/**
 * Client for the R19 generalized calculation Worker prototype.
 *
 * The first implementation intentionally uses ordinary structured cloning.
 * A caller abort rejects immediately, while the underlying Worker request
 * remains pending until its response arrives; this makes stale-work cost
 * observable instead of claiming cooperative cancellation.
 */
export function createWorkerCalculationClient({
  workerFactory = createDefaultWorker,
} = {}) {
  let worker = null
  let nextRequestId = 0
  let disposed = false
  const pending = new Map()
  let workerStartedAt = null
  let workerReadyAt = null
  let readyPromise = null
  let resolveReady = null
  let rejectReady = null

  function rejectPending(error) {
    for (const entry of pending.values()) {
      entry.cleanupAbort()
      if (!entry.callerSettled) {
        entry.callerSettled = true
        entry.reject(error)
      }
    }
    pending.clear()
  }

  function discardWorker(error) {
    rejectPending(error)
    rejectReady?.(error)
    resolveReady = null
    rejectReady = null
    readyPromise = null
    workerStartedAt = null
    workerReadyAt = null
    worker?.terminate()
    worker = null
  }

  function handleWorkerError(event) {
    const error = new Error(event?.message || 'R19 calculation Worker failed')
    discardWorker(error)
  }

  function handleMessage(event) {
    const message = event?.data
    if (message?.type === 'ready' && message.id === undefined) {
      workerReadyAt = performance.now()
      const ready = {
        startupMs: workerStartedAt === null
          ? null
          : workerReadyAt - workerStartedAt,
        readyAt: workerReadyAt,
        workerTiming: message.workerTiming ?? null,
      }
      resolveReady?.(ready)
      resolveReady = null
      rejectReady = null
      readyPromise = null
      return
    }
    const entry = pending.get(message?.id)
    if (!entry) {
      return
    }

    if (message.type === 'plan') {
      try {
        entry.onRangePlan?.(message.plan)
      } catch (error) {
        // A diagnostic callback must not change the Worker protocol. The
        // calculation result remains authoritative for this request.
        entry.callbackError = error
      }
      return
    }

    pending.delete(entry.id)
    entry.cleanupAbort()
    const settledAt = performance.now()
    const transport = {
      sentAt: entry.sentAt,
      settledAt,
      roundTripMs: settledAt - entry.sentAt,
      callerAborted: entry.callerSettled,
      workerTiming: message.workerTiming ?? null,
    }

    try {
      entry.onUnderlyingSettled?.({
        type: message.type,
        transport,
      })
    } catch (error) {
      // Observability hooks are deliberately isolated from settlement. A
      // diagnostic callback must not turn a valid Worker response into a
      // rejected calculation or break the message handler.
      entry.callbackError = error
    }

    if (entry.callerSettled) {
      return
    }
    entry.callerSettled = true
    if (message.type === 'success') {
      entry.resolve({
        result: message.result,
        transport,
      })
      return
    }
    if (message.type === 'failure') {
      const error = new Error(message.error?.message || 'Worker calculation failed')
      error.name = message.error?.name || 'Error'
      if (typeof message.error?.code === 'string') {
        error.code = message.error.code
      }
      if (Array.isArray(message.error?.rejectionReasons)) {
        error.rejectionReasons = [...message.error.rejectionReasons]
      }
      if (message.error?.plan && typeof message.error.plan === 'object') {
        error.plan = message.error.plan
      }
      entry.reject(error)
      return
    }
    entry.reject(new Error(`Unknown R19 Worker response type: ${message.type}`))
  }

  function ensureWorker() {
    if (worker !== null) {
      return worker
    }
    if (disposed) {
      throw new Error('R19 calculation Worker client is disposed')
    }
    worker = workerFactory()
    workerStartedAt = performance.now()
    workerReadyAt = null
    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleWorkerError)
    worker.addEventListener('messageerror', handleWorkerError)
    return worker
  }

  function waitUntilReady() {
    ensureWorker()
    if (workerReadyAt !== null) {
      return Promise.resolve({
        startupMs: workerReadyAt - (workerStartedAt ?? workerReadyAt),
        readyAt: workerReadyAt,
        workerTiming: null,
      })
    }
    if (readyPromise === null) {
      readyPromise = new Promise((resolve, reject) => {
        resolveReady = resolve
        rejectReady = reject
      })
    }
    return readyPromise
  }

  function calculate(operation, args = {}, options = {}) {
    const normalizedOperation = normalizeOperation(operation)
    const supplied = copyOptions(options)
    if (supplied.signal?.aborted) {
      return Promise.reject(createAbortError(normalizedOperation))
    }

    const id = ++nextRequestId
    const sentAt = performance.now()
    const request = {
      id,
      operation: normalizedOperation,
      args,
      options: supplied.cloneable,
    }

    let entry
    const promise = new Promise((resolve, reject) => {
      const abort = () => {
        if (entry.callerSettled) {
          return
        }
        entry.callerSettled = true
        entry.reject(createAbortError(normalizedOperation))
      }
      entry = {
        id,
        sentAt,
        resolve,
        reject,
        callerSettled: false,
        onRangePlan: supplied.onRangePlan,
        onUnderlyingSettled: supplied.onUnderlyingSettled,
        callbackError: null,
        cleanupAbort() {
          supplied.signal?.removeEventListener('abort', abort)
        },
      }
      if (supplied.signal) {
        supplied.signal.addEventListener('abort', abort, { once: true })
      }
      pending.set(id, entry)
    })

    let target
    try {
      target = ensureWorker()
      target.postMessage(request)
    } catch (error) {
      pending.delete(id)
      entry.cleanupAbort()
      if (!entry.callerSettled) {
        entry.callerSettled = true
        entry.reject(error)
      }
    }

    return promise
  }

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true
    discardWorker(new Error('R19 calculation Worker client was disposed'))
  }

  return {
    calculate,
    dispose,
    waitUntilReady,
    get pendingCount() {
      return pending.size
    },
    get workerCreated() {
      return worker !== null
    },
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function isWorkerPromise(value) {
  return isPromiseLike(value)
}
