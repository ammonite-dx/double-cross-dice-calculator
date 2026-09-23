import {
  getRuntimeDamageRollRawSupportMax,
  normalizeRuntimeDamageRollOptions,
  validateRuntimeDamageRollInputs,
} from '../calculation/RuntimeDamageRollLimits'
import type {
  RuntimeDamageRollCalculateOptions,
  RuntimeDamageRollClient,
  RuntimeDamageRollClientOptions,
  RuntimeDamageRollWorkerEvent,
  RuntimeDamageRollWorkerLike,
  RuntimeDamageRollWeights,
} from './RuntimeDamageRollClientTypes'
import type {
  RuntimeDamageRollOptions,
  RuntimeDamageRollWorkerResponse,
} from './RuntimeDamageRollProtocol'

const DEFAULT_CACHE_SIZE = 8
const PROBABILITY_TOLERANCE = 1e-10
const TOTAL_TOLERANCE = 1e-8

type RuntimeDamageRollJobStatus = 'queued' | 'active' | 'settled'

interface RuntimeDamageRollRequestIdentity {
  readonly kazanari: number
  readonly weights: Float64Array
  readonly options: RuntimeDamageRollOptions
}

interface RuntimeDamageRollSubscriber {
  readonly job: RuntimeDamageRollJob
  readonly signal?: AbortSignal
  abortListener: (() => void) | null
  settled: boolean
  readonly resolve: (value: Float64Array) => void
  readonly reject: (reason?: unknown) => void
}

interface RuntimeDamageRollJob extends RuntimeDamageRollRequestIdentity {
  readonly id: number
  readonly subscribers: Set<RuntimeDamageRollSubscriber>
  status: RuntimeDamageRollJobStatus
  settled: boolean
}

interface RuntimeDamageRollCacheEntry extends RuntimeDamageRollRequestIdentity {
  readonly distribution: Float64Array
}

interface RuntimeDamageRollWorkerToken {
  readonly worker: RuntimeDamageRollWorkerLike
}

function createAbortError(message = 'The calculation was aborted'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function validateDistribution(
  distribution: unknown,
  expectedTotal: number,
  expectedLength: number,
): asserts distribution is Float64Array {
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

function requestsEqual(
  entry: RuntimeDamageRollRequestIdentity,
  weights: RuntimeDamageRollWeights,
  kazanari: number,
  options: RuntimeDamageRollOptions,
): boolean {
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

function waitWithSignal(
  promise: Promise<Float64Array>,
  signal: AbortSignal | undefined,
): Promise<Float64Array> {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise<Float64Array>((resolve, reject) => {
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
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

function defaultWorkerFactory(): RuntimeDamageRollWorkerLike {
  return new Worker(new URL('./RuntimeDamageRollWorker.ts', import.meta.url), {
    type: 'module',
  })
}

export function createRuntimeDamageRollClient({
  workerFactory = defaultWorkerFactory,
  cacheSize = DEFAULT_CACHE_SIZE,
}: RuntimeDamageRollClientOptions = {}): RuntimeDamageRollClient {
  if (!Number.isInteger(cacheSize) || cacheSize < 0) {
    throw new RangeError('cacheSize must be a non-negative integer')
  }

  let worker: RuntimeDamageRollWorkerLike | null = null
  let workerToken: RuntimeDamageRollWorkerToken | null = null
  let nextRequestId = 0
  let disposed = false
  let activeJob: RuntimeDamageRollJob | null = null
  const queuedJobs: RuntimeDamageRollJob[] = []
  const cache: RuntimeDamageRollCacheEntry[] = []

  function settleSubscriber(
    subscriber: RuntimeDamageRollSubscriber,
    error: unknown,
    distribution: Float64Array | null,
  ): void {
    if (subscriber.settled) {
      return
    }
    subscriber.settled = true
    if (subscriber.signal && subscriber.abortListener) {
      subscriber.signal.removeEventListener('abort', subscriber.abortListener)
    }
    if (error) {
      subscriber.reject(error)
    } else {
      subscriber.resolve(distribution!.slice())
    }
  }

  function settleJob(
    job: RuntimeDamageRollJob,
    error: unknown,
    distribution: Float64Array | null = null,
  ): void {
    if (job.settled) {
      return
    }
    job.settled = true
    job.status = 'settled'
    for (const subscriber of job.subscribers) {
      settleSubscriber(subscriber, error, distribution)
    }
    job.subscribers.clear()
  }

  function isCurrentWorker(token: RuntimeDamageRollWorkerToken): boolean {
    return workerToken === token && worker === token.worker
  }

  function terminateCurrentWorker(): void {
    const currentWorker = worker
    worker = null
    workerToken = null
    currentWorker?.terminate()
  }

  function removeQueuedJob(job: RuntimeDamageRollJob): boolean {
    const index = queuedJobs.indexOf(job)
    if (index >= 0) {
      queuedJobs.splice(index, 1)
      return true
    }
    return false
  }

  function cancelQueuedJob(job: RuntimeDamageRollJob): void {
    if (job.settled || job.status !== 'queued') {
      return
    }
    removeQueuedJob(job)
    settleJob(job, createAbortError())
  }

  function startNextJob(): void {
    if (disposed || activeJob !== null) {
      return
    }

    while (queuedJobs.length > 0) {
      const job = queuedJobs.shift()!
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
          [transmittedWeights.buffer],
        )
      } catch (error: unknown) {
        activeJob = null
        settleJob(job, error)
        continue
      }
      return
    }
  }

  function finishActiveJob(
    job: RuntimeDamageRollJob,
    error: unknown,
    distribution: Float64Array | null = null,
  ): void {
    if (activeJob !== job || job.settled) {
      return
    }
    activeJob = null
    settleJob(job, error, distribution)
    startNextJob()
  }

  function abortActiveJob(job: RuntimeDamageRollJob): void {
    if (activeJob !== job || job.settled) {
      return
    }
    activeJob = null
    terminateCurrentWorker()
    settleJob(job, createAbortError())
    startNextJob()
  }

  function handleMessage(
    token: RuntimeDamageRollWorkerToken,
    event: RuntimeDamageRollWorkerEvent,
  ): void {
    if (!isCurrentWorker(token) || activeJob === null) {
      return
    }
    const job = activeJob
    const response: RuntimeDamageRollWorkerResponse | undefined = event.data
    if (response?.id !== job.id) {
      return
    }

    if ('error' in response && response.error) {
      const error = new Error(response.error.message)
      error.name = response.error.name || 'Error'
      finishActiveJob(job, error)
      return
    }

    try {
      const responseDistribution = 'distribution' in response
        ? response.distribution
        : undefined
      const expectedTotal = job.weights.reduce(
        (total, weight) => total + weight,
        0,
      )
      validateDistribution(
        responseDistribution,
        expectedTotal,
        job.options.distributionLength,
      )
      const distribution = responseDistribution

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
    } catch (error: unknown) {
      finishActiveJob(job, error)
    }
  }

  function rejectQueuedJobs(error: unknown): void {
    while (queuedJobs.length > 0) {
      settleJob(queuedJobs.shift()!, error)
    }
  }

  function handleWorkerError(
    token: RuntimeDamageRollWorkerToken,
    event: RuntimeDamageRollWorkerEvent,
  ): void {
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

  function getWorker(): RuntimeDamageRollWorkerLike {
    if (!worker) {
      const createdWorker = workerFactory()
      const token: RuntimeDamageRollWorkerToken = { worker: createdWorker }
      worker = createdWorker
      workerToken = token
      createdWorker.addEventListener('message', (event) => {
        handleMessage(token, event)
      })
      createdWorker.addEventListener('error', (event) => {
        handleWorkerError(token, event)
      })
      createdWorker.addEventListener('messageerror', (event) => {
        handleWorkerError(token, event)
      })
    }
    return worker
  }

  function findPending(
    weights: RuntimeDamageRollWeights,
    kazanari: number,
    options: RuntimeDamageRollOptions,
  ): RuntimeDamageRollJob | null {
    if (activeJob && requestsEqual(activeJob, weights, kazanari, options)) {
      return activeJob
    }
    return queuedJobs.find((job) =>
      requestsEqual(job, weights, kazanari, options),
    ) ?? null
  }

  function takeCached(
    weights: RuntimeDamageRollWeights,
    kazanari: number,
    options: RuntimeDamageRollOptions,
  ): Float64Array | null {
    const index = cache.findIndex((entry) =>
      requestsEqual(entry, weights, kazanari, options),
    )
    if (index < 0) {
      return null
    }

    const [entry] = cache.splice(index, 1)
    cache.unshift(entry)
    return entry.distribution.slice()
  }

  function subscribe(
    job: RuntimeDamageRollJob,
    signal: AbortSignal | undefined,
  ): Promise<Float64Array> {
    let resolveSubscriber!: (value: Float64Array) => void
    let rejectSubscriber!: (reason?: unknown) => void
    const promise = new Promise<Float64Array>((resolve, reject) => {
      resolveSubscriber = resolve
      rejectSubscriber = reject
    })
    const subscriber: RuntimeDamageRollSubscriber = {
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
      settleSubscriber(subscriber, createAbortError(), null)
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

  function calculate(
    weights: RuntimeDamageRollWeights,
    kazanari: number,
    options: RuntimeDamageRollCalculateOptions = {},
  ): Promise<Float64Array> {
    if (disposed) {
      return Promise.reject(new Error('Runtime damage client is disposed'))
    }
    validateRuntimeDamageRollInputs(weights, kazanari)
    const normalizedOptions = normalizeRuntimeDamageRollOptions(
      options,
      getRuntimeDamageRollRawSupportMax(weights),
    ) as RuntimeDamageRollOptions
    const signal = options?.signal
    if (signal?.aborted) {
      return Promise.reject(createAbortError())
    }

    const cached = takeCached(weights, kazanari, normalizedOptions)
    if (cached) {
      const settled = Promise.resolve(cached)
      return waitWithSignal(settled, signal)
    }

    const existing = findPending(weights, kazanari, normalizedOptions)
    if (existing) {
      return subscribe(existing, signal)
    }

    const id = nextRequestId
    nextRequestId += 1
    const storedWeights = Float64Array.from(weights)
    const job: RuntimeDamageRollJob = {
      id,
      kazanari,
      weights: storedWeights,
      options: normalizedOptions,
      status: 'queued',
      subscribers: new Set(),
      settled: false,
    }
    const request = subscribe(job, signal)
    queuedJobs.push(job)
    startNextJob()
    return request
  }

  function clearCache(): void {
    cache.length = 0
  }

  function dispose(): void {
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
