import {
  getRuntimeDamageRollRawSupportMax,
  normalizeRuntimeDamageRollOptions,
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

function validateDistribution(
  distribution,
  expectedTotal,
  expectedLength
) {
  if (
    !(distribution instanceof Float64Array) ||
    distribution.length !== expectedLength
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

function requestsEqual(entry, weights, kazanari, options) {
  if (
    entry.kazanari !== kazanari ||
    entry.weights.length !== weights.length ||
    entry.options.fftLength !== options.fftLength ||
    entry.options.distributionLength !== options.distributionLength ||
    entry.options.rawSupportMax !== options.rawSupportMax
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

function notifyUnderlyingSettled(options, promise) {
  if (typeof options?.onUnderlyingSettled !== 'function') {
    return
  }
  try {
    options.onUnderlyingSettled(promise)
  } catch {
    // Lifecycle observation is an internal diagnostic hook. A consumer
    // callback must not change the calculation contract.
  }
}

function waitWithSignal(promise, signal) {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(createAbortError())
    }
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
  let workerToken = null
  let nextRequestId = 0
  let disposed = false
  let activeJob = null
  const queuedJobs = []
  const cache = []

  function settleSubscriber(subscriber, error, distribution) {
    if (subscriber.settled) {
      return
    }
    subscriber.settled = true
    if (subscriber.signal && subscriber.abortListener) {
      subscriber.signal.removeEventListener(
        'abort',
        subscriber.abortListener
      )
    }
    if (error) {
      subscriber.reject(error)
    } else {
      subscriber.resolve(distribution.slice())
    }
  }

  function settleJob(job, error, distribution) {
    if (job.settled) {
      return
    }
    job.settled = true
    job.status = 'settled'
    for (const subscriber of job.subscribers) {
      settleSubscriber(subscriber, error, distribution)
    }
    job.subscribers.clear()
    if (error) {
      job.rejectLifecycle(error)
    } else {
      job.resolveLifecycle(distribution.slice())
    }
  }

  function isCurrentWorker(token) {
    return workerToken === token && worker === token.worker
  }

  function terminateCurrentWorker() {
    const currentWorker = worker
    worker = null
    workerToken = null
    currentWorker?.terminate()
  }

  function removeQueuedJob(job) {
    const index = queuedJobs.indexOf(job)
    if (index >= 0) {
      queuedJobs.splice(index, 1)
      return true
    }
    return false
  }

  function cancelQueuedJob(job) {
    if (job.settled || job.status !== 'queued') {
      return
    }
    removeQueuedJob(job)
    settleJob(job, createAbortError())
  }

  function startNextJob() {
    if (disposed || activeJob !== null) {
      return
    }

    while (queuedJobs.length > 0) {
      const job = queuedJobs.shift()
      if (job.settled) {
        continue
      }
      if (job.subscribers.size === 0) {
        settleJob(job, createAbortError())
        continue
      }

      job.status = 'active'
      activeJob = job
      try {
        const currentWorker = getWorker()
        const transmittedWeights = job.weights.slice()
        currentWorker.postMessage(
          {
            id: job.id,
            weights: transmittedWeights,
            kazanari: job.kazanari,
            options: job.options,
          },
          [transmittedWeights.buffer]
        )
      } catch (error) {
        activeJob = null
        settleJob(job, error)
        continue
      }
      return
    }
  }

  function finishActiveJob(job, error, distribution = null) {
    if (activeJob !== job || job.settled) {
      return
    }
    activeJob = null
    settleJob(job, error, distribution)
    startNextJob()
  }

  function abortActiveJob(job) {
    if (activeJob !== job || job.settled) {
      return
    }
    activeJob = null
    terminateCurrentWorker()
    settleJob(job, createAbortError())
    startNextJob()
  }

  function handleMessage(token, event) {
    if (!isCurrentWorker(token) || activeJob === null) {
      return
    }
    const job = activeJob
    if (event.data?.id !== job.id) {
      return
    }

    if (event.data.error) {
      const error = new Error(event.data.error.message)
      error.name = event.data.error.name || 'Error'
      finishActiveJob(job, error)
      return
    }

    try {
      const expectedTotal = job.weights.reduce(
        (total, weight) => total + weight,
        0
      )
      validateDistribution(
        event.data.distribution,
        expectedTotal,
        job.options.distributionLength
      )
      const distribution = event.data.distribution

      if (cacheSize > 0) {
        cache.unshift({
          kazanari: job.kazanari,
          weights: job.weights,
          options: job.options,
          distribution,
        })
        cache.splice(cacheSize)
      }
      finishActiveJob(job, null, distribution)
    } catch (error) {
      finishActiveJob(job, error)
    }
  }

  function rejectQueuedJobs(error) {
    while (queuedJobs.length > 0) {
      settleJob(queuedJobs.shift(), error)
    }
  }

  function handleWorkerError(token, event) {
    if (!isCurrentWorker(token)) {
      return
    }
    const error = new Error(event?.message || 'Runtime damage Worker failed')
    const job = activeJob
    activeJob = null
    terminateCurrentWorker()
    if (job) {
      settleJob(job, error)
    }
    rejectQueuedJobs(error)
  }

  function getWorker() {
    if (!worker) {
      const createdWorker = workerFactory()
      const token = { worker: createdWorker }
      worker = createdWorker
      workerToken = token
      createdWorker.addEventListener(
        'message',
        (event) => handleMessage(token, event)
      )
      createdWorker.addEventListener(
        'error',
        (event) => handleWorkerError(token, event)
      )
      createdWorker.addEventListener(
        'messageerror',
        (event) => handleWorkerError(token, event)
      )
    }
    return worker
  }

  function findPending(weights, kazanari, options) {
    if (
      activeJob &&
      requestsEqual(activeJob, weights, kazanari, options)
    ) {
      return activeJob
    }
    return queuedJobs.find((job) =>
      requestsEqual(job, weights, kazanari, options)
    ) ?? null
  }

  function takeCached(weights, kazanari, options) {
    const index = cache.findIndex((entry) =>
      requestsEqual(entry, weights, kazanari, options)
    )
    if (index < 0) {
      return null
    }

    const [entry] = cache.splice(index, 1)
    cache.unshift(entry)
    return entry.distribution.slice()
  }

  function subscribe(job, signal) {
    let resolveSubscriber
    let rejectSubscriber
    const promise = new Promise((resolve, reject) => {
      resolveSubscriber = resolve
      rejectSubscriber = reject
    })
    const subscriber = {
      job,
      signal,
      abortListener: null,
      settled: false,
      resolve: resolveSubscriber,
      reject: rejectSubscriber,
    }

    const abort = () => {
      if (subscriber.settled) {
        return
      }
      settleSubscriber(subscriber, createAbortError())
      job.subscribers.delete(subscriber)
      if (job.subscribers.size !== 0 || job.settled) {
        return
      }
      if (job.status === 'queued') {
        cancelQueuedJob(job)
      } else if (job.status === 'active') {
        abortActiveJob(job)
      }
    }
    subscriber.abortListener = abort

    if (signal?.aborted) {
      abort()
      return promise
    }
    job.subscribers.add(subscriber)
    if (signal) {
      signal.addEventListener('abort', abort, { once: true })
    }
    return promise
  }

  function calculate(weights, kazanari, options = {}) {
    if (disposed) {
      return Promise.reject(new Error('Runtime damage client is disposed'))
    }
    validateRuntimeDamageRollInputs(weights, kazanari)
    const normalizedOptions = normalizeRuntimeDamageRollOptions(
      options,
      getRuntimeDamageRollRawSupportMax(weights)
    )
    const signal = options?.signal
    if (signal?.aborted) {
      return Promise.reject(createAbortError())
    }

    const cached = takeCached(weights, kazanari, normalizedOptions)
    if (cached) {
      const settled = Promise.resolve(cached)
      notifyUnderlyingSettled(options, settled)
      return waitWithSignal(settled, signal)
    }

    const existing = findPending(
      weights,
      kazanari,
      normalizedOptions
    )
    if (existing) {
      const request = subscribe(existing, signal)
      notifyUnderlyingSettled(options, existing.lifecyclePromise)
      return request
    }

    const id = nextRequestId
    nextRequestId += 1
    const storedWeights = Float64Array.from(weights)
    let resolveLifecycle
    let rejectLifecycle
    const lifecyclePromise = new Promise((resolve, reject) => {
      resolveLifecycle = resolve
      rejectLifecycle = reject
    })
    // A lifecycle observer is optional. Keep an unhandled rejection from a
    // calculation whose caller has already aborted without observing it.
    lifecyclePromise.catch(() => {})
    const job = {
      id,
      kazanari,
      weights: storedWeights,
      options: normalizedOptions,
      status: 'queued',
      subscribers: new Set(),
      lifecyclePromise,
      resolveLifecycle,
      rejectLifecycle,
      settled: false,
    }
    const request = subscribe(job, signal)
    queuedJobs.push(job)
    notifyUnderlyingSettled(options, lifecyclePromise)
    startNextJob()
    return request
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
    const error = createAbortError('Runtime damage client was disposed')
    const job = activeJob
    activeJob = null
    terminateCurrentWorker()
    if (job) {
      settleJob(job, error)
    }
    rejectQueuedJobs(error)
  }

  return {
    calculate,
    clearCache,
    dispose,
  }
}
