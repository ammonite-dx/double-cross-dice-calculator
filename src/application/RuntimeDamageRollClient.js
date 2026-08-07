import {
  RUNTIME_DAMAGE_DISTRIBUTION_SIZE,
  validateRuntimeDamageRollInputs,
} from '../calculation/RuntimeDamageRollLimits'

const DEFAULT_CACHE_SIZE = 8
const PROBABILITY_TOLERANCE = 1e-10
const TOTAL_TOLERANCE = 1e-8

function createAbortError(message = 'The calculation was aborted') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function validateDistribution(distribution, expectedTotal) {
  if (
    !(distribution instanceof Float64Array) ||
    distribution.length !== RUNTIME_DAMAGE_DISTRIBUTION_SIZE
  ) {
    throw new Error('Worker returned an invalid distribution')
  }
  let total = 0
  for (const probability of distribution) {
    if (!Number.isFinite(probability)) {
      throw new Error('Worker returned a non-finite probability')
    }
    if (probability < -PROBABILITY_TOLERANCE) {
      throw new Error('Worker returned a negative probability')
    }
    total += probability
  }

  const allowedError = TOTAL_TOLERANCE * Math.max(1, expectedTotal)
  if (Math.abs(total - expectedTotal) > allowedError) {
    throw new Error('Worker returned a distribution with an invalid total')
  }
}

function requestsEqual(entry, weights, kazanari) {
  if (
    entry.kazanari !== kazanari ||
    entry.weights.length !== weights.length
  ) {
    return false
  }

  for (let index = 0; index < weights.length; index += 1) {
    if (entry.weights[index] !== weights[index]) {
      return false
    }
  }
  return true
}

function waitWithSignal(promise, signal) {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError())
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

function defaultWorkerFactory() {
  return new Worker(new URL('./RuntimeDamageRollWorker.js', import.meta.url), {
    type: 'module',
  })
}

export function createRuntimeDamageRollClient({
  workerFactory = defaultWorkerFactory,
  cacheSize = DEFAULT_CACHE_SIZE,
} = {}) {
  if (!Number.isInteger(cacheSize) || cacheSize < 0) {
    throw new RangeError('cacheSize must be a non-negative integer')
  }

  let worker = null
  let nextRequestId = 0
  let disposed = false
  const pendingById = new Map()
  const cache = []

  function rejectPending(error) {
    for (const entry of pendingById.values()) {
      entry.reject(error)
    }
    pendingById.clear()
  }

  function discardWorker(error) {
    rejectPending(error)
    worker?.terminate()
    worker = null
  }

  function handleMessage(event) {
    const entry = pendingById.get(event.data?.id)
    if (!entry) {
      return
    }
    pendingById.delete(entry.id)

    if (event.data.error) {
      const error = new Error(event.data.error.message)
      error.name = event.data.error.name || 'Error'
      entry.reject(error)
      return
    }

    try {
      const expectedTotal = entry.weights.reduce(
        (total, weight) => total + weight,
        0
      )
      validateDistribution(event.data.distribution, expectedTotal)
      const distribution = event.data.distribution

      if (cacheSize > 0) {
        cache.unshift({
          kazanari: entry.kazanari,
          weights: entry.weights,
          distribution,
        })
        cache.splice(cacheSize)
      }
      entry.resolve(distribution)
    } catch (error) {
      entry.reject(error)
    }
  }

  function handleWorkerError(event) {
    const error = new Error(event?.message || 'Runtime damage Worker failed')
    discardWorker(error)
  }

  function getWorker() {
    if (!worker) {
      worker = workerFactory()
      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleWorkerError)
      worker.addEventListener('messageerror', handleWorkerError)
    }
    return worker
  }

  function findPending(weights, kazanari) {
    for (const entry of pendingById.values()) {
      if (requestsEqual(entry, weights, kazanari)) {
        return entry
      }
    }
    return null
  }

  function takeCached(weights, kazanari) {
    const index = cache.findIndex((entry) =>
      requestsEqual(entry, weights, kazanari)
    )
    if (index < 0) {
      return null
    }

    const [entry] = cache.splice(index, 1)
    cache.unshift(entry)
    return entry.distribution.slice()
  }

  function calculate(weights, kazanari, { signal } = {}) {
    if (disposed) {
      return Promise.reject(new Error('Runtime damage client is disposed'))
    }
    validateRuntimeDamageRollInputs(weights, kazanari)
    if (signal?.aborted) {
      return Promise.reject(createAbortError())
    }

    const cached = takeCached(weights, kazanari)
    if (cached) {
      return waitWithSignal(Promise.resolve(cached), signal)
    }

    const existing = findPending(weights, kazanari)
    if (existing) {
      return waitWithSignal(
        existing.promise.then((distribution) => distribution.slice()),
        signal
      )
    }

    const id = nextRequestId
    nextRequestId += 1
    const storedWeights = Float64Array.from(weights)
    const transmittedWeights = storedWeights.slice()
    let resolveRequest
    let rejectRequest
    const promise = new Promise((resolve, reject) => {
      resolveRequest = resolve
      rejectRequest = reject
    })
    const entry = {
      id,
      kazanari,
      weights: storedWeights,
      promise,
      resolve: resolveRequest,
      reject: rejectRequest,
    }
    pendingById.set(id, entry)

    try {
      getWorker().postMessage(
        { id, weights: transmittedWeights, kazanari },
        [transmittedWeights.buffer]
      )
    } catch (error) {
      pendingById.delete(id)
      rejectRequest(error)
    }

    return waitWithSignal(
      promise.then((distribution) => distribution.slice()),
      signal
    )
  }

  function clearCache() {
    cache.length = 0
  }

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true
    cache.length = 0
    discardWorker(createAbortError('Runtime damage client was disposed'))
  }

  return {
    calculate,
    clearCache,
    dispose,
  }
}
