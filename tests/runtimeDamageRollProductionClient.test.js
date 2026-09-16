import { describe, expect, it, vi } from 'vitest'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import { createCalculationClient } from '../src/runtime/CalculationClient'
import {
  createRuntimeDamageRollClient,
} from '../src/runtime/RuntimeDamageRollClient'
import { createResourceGuard } from '../src/runtime/ResourceGuard'

class FakeWorker {
  constructor() {
    this.listeners = new Map()
    this.messages = []
    this.terminate = vi.fn()
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type).push(listener)
  }

  postMessage(message, transfer = []) {
    this.messages.push({ message, transfer })
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  respond(index, distribution) {
    this.emit('message', {
      data: {
        id: this.messages[index].message.id,
        distribution,
      },
    })
  }
}

function createHarness(options = {}) {
  const workers = []
  const client = createRuntimeDamageRollClient({
    ...options,
    workerFactory: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
  })
  return { client, workers }
}

function distributionAt(value, size = 2048) {
  const distribution = new Float64Array(size)
  distribution[value] = 1
  return distribution
}

describe('production runtime damage roll Worker client', () => {
  it('accepts a full-tail weight vector beyond the legacy 202-dice asset', async () => {
    const { client, workers } = createHarness()
    const weights = new Float64Array(204)
    weights[203] = 1
    const request = client.calculate(weights, 0, {
      fftLength: 4096,
      distributionLength: 2048,
    })
    const worker = workers[0]

    expect(worker.messages[0].message.weights).toHaveLength(204)
    expect(worker.messages[0].message.options.rawSupportMax).toBe(2030)
    worker.respond(0, distributionAt(2030))

    await expect(request).resolves.toEqual(distributionAt(2030))
  })

  it('uses one resident Worker and returns defensive copies', async () => {
    const { client, workers } = createHarness()
    const request = client.calculate(new Float64Array([0.25, 0.75]), 3)
    const worker = workers[0]

    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0].message).toMatchObject({ kazanari: 3 })
    expect(worker.messages[0].transfer).toHaveLength(1)

    const source = distributionAt(17)
    worker.respond(0, source)
    const result = await request

    expect(result).not.toBe(source)
    expect(result[17]).toBe(1)
    result[17] = 0

    const cached = await client.calculate([0.25, 0.75], 3)
    expect(cached[17]).toBe(1)
    expect(workers).toHaveLength(1)
  })

  it('snapshots caller weights before queueing and posting', async () => {
    const { client, workers } = createHarness()
    const weights = [0.25, 0.75]
    const request = client.calculate(weights, 3)
    weights[0] = 1
    weights[1] = 0

    const worker = workers[0]
    expect(Array.from(worker.messages[0].message.weights)).toEqual([0.25, 0.75])
    worker.respond(0, distributionAt(17))

    await expect(request).resolves.toEqual(distributionAt(17))
    await expect(client.calculate([0.25, 0.75], 3)).resolves.toEqual(
      distributionAt(17)
    )
    expect(worker.messages).toHaveLength(1)
  })

  it('forwards variable options and keeps distinct output ranges in the cache', async () => {
    const { client, workers } = createHarness()
    const options = {
      fftLength: 16,
      distributionLength: 8,
      requestId: 'caller-request',
    }
    const first = client.calculate([0, 1], 0, options)
    const worker = workers[0]

    expect(worker.messages[0].message.options).toEqual({
      fftLength: 16,
      distributionLength: 8,
      rawSupportMax: 10,
    })
    expect(worker.messages[0].message.options).not.toHaveProperty('signal')
    worker.respond(0, distributionAt(7, 8))
    await expect(first).resolves.toEqual(distributionAt(7, 8))

    await expect(client.calculate([0, 1], 0, options)).resolves.toEqual(
      distributionAt(7, 8)
    )
    expect(worker.messages).toHaveLength(1)

    const differentLength = client.calculate(
      [0, 1],
      0,
      { fftLength: 16, distributionLength: 16 }
    )
    expect(worker.messages).toHaveLength(2)
    expect(worker.messages[1].message.options).toEqual({
      fftLength: 16,
      distributionLength: 16,
      rawSupportMax: 10,
    })
    worker.respond(1, distributionAt(10, 16))
    await expect(differentLength).resolves.toEqual(distributionAt(10, 16))
  })

  it('does not share requests with different explicit raw support bounds', async () => {
    const { client, workers } = createHarness()
    const first = client.calculate(
      [0, 1],
      0,
      { fftLength: 16, distributionLength: 8, rawSupportMax: 10 }
    )
    const second = client.calculate(
      [0, 1],
      0,
      { fftLength: 16, distributionLength: 8, rawSupportMax: 12 }
    )
    const worker = workers[0]

    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0].message.options.rawSupportMax).toBe(10)

    worker.respond(0, distributionAt(1, 8))
    await expect(first).resolves.toEqual(distributionAt(1, 8))

    expect(worker.messages).toHaveLength(2)
    expect(worker.messages[1].message.options.rawSupportMax).toBe(12)
    worker.respond(1, distributionAt(2, 8))
    await expect(second).resolves.toEqual(distributionAt(2, 8))

    await expect(client.calculate(
      [0, 1],
      0,
      { fftLength: 16, distributionLength: 8, rawSupportMax: 10 }
    )).resolves.toEqual(distributionAt(1, 8))
    await expect(client.calculate(
      [0, 1],
      0,
      { fftLength: 16, distributionLength: 8, rawSupportMax: 12 }
    )).resolves.toEqual(distributionAt(2, 8))
    expect(worker.messages).toHaveLength(2)
  })

  it.each([
    [{ fftLength: 12 }, 'power of two'],
    [{ fftLength: 8, distributionLength: 8 }, 'greater than rawSupportMax'],
    [{ fftLength: 16, distributionLength: 17 }, 'distributionLength'],
    [{ fftLength: 16, distributionLength: 1 }, 'distributionLength must be at least'],
  ])('rejects invalid options before creating a Worker %#', (options, message) => {
    const { client, workers } = createHarness()

    expect(() => client.calculate([0, 1], 0, options)).toThrow(message)
    expect(workers).toHaveLength(0)
  })

  it('shares one pending calculation for identical inputs', async () => {
    const { client, workers } = createHarness()
    const first = client.calculate([0.1, 0.9], 5)
    const second = client.calculate(new Float64Array([0.1, 0.9]), 5)
    const worker = workers[0]

    expect(worker.messages).toHaveLength(1)
    worker.respond(0, distributionAt(23))

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult[23]).toBe(1)
    expect(secondResult[23]).toBe(1)
    expect(firstResult).not.toBe(secondResult)
  })

  it('does not share requests with different weights or kazanari', async () => {
    const { client, workers } = createHarness()
    const requests = [
      client.calculate([0.2, 0.8], 1),
      client.calculate([0.3, 0.7], 1),
      client.calculate([0.2, 0.8], 2),
    ]
    const worker = workers[0]

    expect(worker.messages).toHaveLength(1)
    worker.respond(0, distributionAt(1))
    await expect(requests[0]).resolves.toEqual(distributionAt(1))

    expect(worker.messages).toHaveLength(2)
    worker.respond(1, distributionAt(2))
    await expect(requests[1]).resolves.toEqual(distributionAt(2))

    expect(worker.messages).toHaveLength(3)
    worker.respond(2, distributionAt(3))
    await expect(requests[2]).resolves.toEqual(distributionAt(3))
  })

  it('does not start work for an already aborted request', async () => {
    const { client, workers } = createHarness()
    const controller = new AbortController()
    controller.abort()

    await expect(
      client.calculate([0.4, 0.6], 7, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers).toHaveLength(0)
  })

  it('aborts one caller without cancelling a shared calculation', async () => {
    const { client, workers } = createHarness()
    const controller = new AbortController()
    const abandoned = client.calculate([0.4, 0.6], 7, {
      signal: controller.signal,
    })
    const current = client.calculate([0.4, 0.6], 7)
    const worker = workers[0]

    controller.abort()
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.messages).toHaveLength(1)

    worker.respond(0, distributionAt(31))
    await expect(current).resolves.toEqual(distributionAt(31))
    await expect(client.calculate([0.4, 0.6], 7)).resolves.toEqual(
      distributionAt(31)
    )
    expect(worker.messages).toHaveLength(1)
  })

  it('terminates the active Worker when its sole caller aborts', async () => {
    const { client, workers } = createHarness()
    const controller = new AbortController()
    const request = client.calculate([1], 0, { signal: controller.signal })
    const worker = workers[0]

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(workers).toHaveLength(1)
  })

  it('terminates a shared active Worker only after the last caller aborts', async () => {
    const { client, workers } = createHarness()
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = client.calculate([0.4, 0.6], 7, {
      signal: firstController.signal,
    })
    const second = client.calculate([0.4, 0.6], 7, {
      signal: secondController.signal,
    })
    const worker = workers[0]

    firstController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).not.toHaveBeenCalled()

    secondController.abort()
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('removes an aborted queued job without terminating the active Worker', async () => {
    const { client, workers } = createHarness()
    const queuedController = new AbortController()
    const active = client.calculate([1], 0)
    const queued = client.calculate([0, 1], 0, {
      signal: queuedController.signal,
    })
    const worker = workers[0]

    expect(worker.messages).toHaveLength(1)
    queuedController.abort()
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(worker.messages).toHaveLength(1)

    worker.respond(0, distributionAt(1))
    await expect(active).resolves.toEqual(distributionAt(1))
  })

  it('starts the next queued job on a fresh Worker after active abort', async () => {
    const { client, workers } = createHarness()
    const activeController = new AbortController()
    const active = client.calculate([1], 0, {
      signal: activeController.signal,
    })
    const queued = client.calculate([0, 1], 0)
    const firstWorker = workers[0]

    expect(firstWorker.messages).toHaveLength(1)
    activeController.abort()
    await expect(active).rejects.toMatchObject({ name: 'AbortError' })

    expect(firstWorker.terminate).toHaveBeenCalledOnce()
    expect(workers).toHaveLength(2)
    expect(workers[1].messages).toHaveLength(1)
    workers[1].respond(0, distributionAt(2))
    await expect(queued).resolves.toEqual(distributionAt(2))
  })

  it('ignores late events from a terminated Worker', async () => {
    const { client, workers } = createHarness()
    const activeController = new AbortController()
    const active = client.calculate([1], 0, {
      signal: activeController.signal,
    })
    const queued = client.calculate([0, 1], 0)
    const firstWorker = workers[0]
    const firstId = firstWorker.messages[0].message.id

    activeController.abort()
    await expect(active).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers).toHaveLength(2)

    firstWorker.emit('message', {
      data: { id: firstId, distribution: distributionAt(99) },
    })
    firstWorker.emit('error', { message: 'late worker error' })
    firstWorker.emit('messageerror', { message: 'late message error' })

    expect(workers[1].terminate).not.toHaveBeenCalled()
    workers[1].respond(0, distributionAt(2))
    await expect(queued).resolves.toEqual(distributionAt(2))
  })

  it('evicts the least recently used cached result', async () => {
    const { client, workers } = createHarness({ cacheSize: 2 })
    expect(workers).toHaveLength(0)

    const first = client.calculate([1], 0)
    const activeWorker = workers[0]
    activeWorker.respond(0, distributionAt(1))
    await first

    const second = client.calculate([0, 1], 0)
    activeWorker.respond(1, distributionAt(2))
    await second

    await client.calculate([1], 0)

    const third = client.calculate([0, 0, 1], 0)
    activeWorker.respond(2, distributionAt(3))
    await third

    const evicted = client.calculate([0, 1], 0)
    expect(activeWorker.messages).toHaveLength(4)
    activeWorker.respond(3, distributionAt(2))
    await evicted
  })

  it('rejects invalid Worker results without poisoning the Worker', async () => {
    const { client, workers } = createHarness()
    const request = client.calculate([0.25, 0.75], 3)

    workers[0].respond(0, new Float64Array(2048))

    await expect(request).rejects.toThrow('invalid total')

    const next = client.calculate([1], 3)
    expect(workers).toHaveLength(1)
    workers[0].respond(1, distributionAt(4))
    await expect(next).resolves.toEqual(distributionAt(4))
  })

  it('keeps the resident Worker after a job-level calculation error', async () => {
    const { client, workers } = createHarness()
    const failed = client.calculate([1], 4)
    const queued = client.calculate([0, 1], 4)
    const worker = workers[0]
    const failedId = worker.messages[0].message.id

    expect(worker.messages).toHaveLength(1)
    worker.emit('message', {
      data: {
        id: failedId,
        error: { name: 'RangeError', message: 'invalid calculation' },
      },
    })

    await expect(failed).rejects.toMatchObject({
      name: 'RangeError',
      message: 'invalid calculation',
    })
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(worker.messages).toHaveLength(2)
    worker.respond(1, distributionAt(2))
    await expect(queued).resolves.toEqual(distributionAt(2))
    expect(workers).toHaveLength(1)
  })

  it('rejects a Worker result with a material negative probability', async () => {
    const { client, workers } = createHarness()
    const request = client.calculate([1], 3)
    const distribution = distributionAt(10)
    distribution[11] = -1e-5
    distribution[10] += 1e-5

    workers[0].respond(0, distribution)

    await expect(request).rejects.toThrow('negative probability')
  })

  it('recreates the Worker after a fatal Worker error', async () => {
    const { client, workers } = createHarness()
    const failed = client.calculate([1], 2)
    const firstWorker = workers[0]
    firstWorker.emit('error', { message: 'worker crashed' })

    await expect(failed).rejects.toThrow('worker crashed')
    expect(firstWorker.terminate).toHaveBeenCalledOnce()

    const recovered = client.calculate([0, 1], 2)
    expect(workers).toHaveLength(2)
    workers[1].respond(0, distributionAt(2))
    await recovered
  })

  it('rejects queued jobs on a fatal Worker error and recovers for future work', async () => {
    const { client, workers } = createHarness()
    const first = client.calculate([1], 2)
    const second = client.calculate([0, 1], 2)
    const firstWorker = workers[0]

    firstWorker.emit('error', { message: 'worker crashed' })

    await expect(first).rejects.toThrow('worker crashed')
    await expect(second).rejects.toThrow('worker crashed')
    expect(firstWorker.terminate).toHaveBeenCalledOnce()

    const recovered = client.calculate([0, 0, 1], 2)
    expect(workers).toHaveLength(2)
    workers[1].respond(0, distributionAt(3))
    await expect(recovered).resolves.toEqual(distributionAt(3))
  })

  it('rejects pending work and terminates the Worker when disposed', async () => {
    const { client, workers } = createHarness()
    const pending = client.calculate([1], 0)
    const worker = workers[0]

    client.dispose()
    client.dispose()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(client.calculate([1], 0)).rejects.toThrow('disposed')
  })

  it('rejects active and queued jobs together when disposed', async () => {
    const { client, workers } = createHarness()
    const active = client.calculate([1], 0)
    const queued = client.calculate([0, 1], 0)
    const worker = workers[0]

    expect(worker.messages).toHaveLength(1)
    client.dispose()

    await expect(active).rejects.toMatchObject({ name: 'AbortError' })
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.messages).toHaveLength(1)
    expect(workers).toHaveLength(1)
  })

  it('releases the CalculationClient lease immediately after an aborted Worker request is preempted', async () => {
    const workers = []
    const runtimeClient = createRuntimeDamageRollClient({
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
    })
    const guard = createResourceGuard({
      capacityBytes: 1024,
      maxActive: 1,
      maxQueued: 0,
      reservationMultiplier: 1,
    })
    const envelope = {
      result: createDistributionResult({
        values: [1],
        offset: 0,
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      metadata: { forcedFailureProbability: 0, modeledDistribution: true },
    }
    const plan = {
      accepted: true,
      operation: 'attack',
      estimates: { float64Bytes: 1, cpuWork: 1 },
      scores: [{}, {}],
    }
    const client = createCalculationClient({
      planCalculationRanges: vi.fn(() => plan),
      resourceGuard: guard,
      calculateScore: vi.fn(() => envelope),
      calculateDamageOnDemand: vi.fn(async (
        _score,
        _attack,
        _defence,
        providers,
        runtimeOptions,
      ) => {
        await providers.getDamageRollDistribution([1], 0, {
          ...runtimeOptions,
          fftLength: 16,
          distributionLength: 2,
          rawSupportMax: 0,
        })
        return envelope
      }),
      getScoreStatistics: vi.fn(() => ({})),
      getDamageStatistics: vi.fn(() => ({})),
      getDamageRollDistribution: runtimeClient.calculate,
    })
    const controller = new AbortController()
    const request = client.calculateAttack({
      action: {
        score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
        damage: { dice: 0, value: 0, kazanari: 0 },
      },
      reaction: {
        mode: 'ドッジ',
        score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
        damage: { dice: 0, value: 0 },
      },
    }, { signal: controller.signal })

    await vi.waitFor(() => expect(workers).toHaveLength(1))
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(guard.snapshot().activeCount).toBe(0)
  })

  it('keeps a shared Worker job alive while releasing only the aborted caller lease', async () => {
    const workers = []
    const runtimeClient = createRuntimeDamageRollClient({
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
    })
    const firstGuard = createResourceGuard({
      capacityBytes: 1024,
      maxActive: 1,
      maxQueued: 0,
      reservationMultiplier: 1,
    })
    const secondGuard = createResourceGuard({
      capacityBytes: 1024,
      maxActive: 1,
      maxQueued: 0,
      reservationMultiplier: 1,
    })
    const envelope = {
      result: createDistributionResult({
        values: [1],
        offset: 0,
        support: { kind: 'finite', max: 0 },
        overflow: null,
      }),
      metadata: { forcedFailureProbability: 0, modeledDistribution: true },
    }
    const plan = {
      accepted: true,
      operation: 'attack',
      estimates: { float64Bytes: 1, cpuWork: 1 },
      scores: [{}, {}],
    }
    const createClient = (resourceGuard) => createCalculationClient({
      planCalculationRanges: vi.fn(() => plan),
      resourceGuard,
      calculateScore: vi.fn(() => envelope),
      calculateDamageOnDemand: vi.fn(async (
        _score,
        _attack,
        _defence,
        providers,
        runtimeOptions,
      ) => {
        await providers.getDamageRollDistribution([1], 0, {
          ...runtimeOptions,
          fftLength: 16,
          distributionLength: 8,
          rawSupportMax: 0,
        })
        return envelope
      }),
      getScoreStatistics: vi.fn(() => ({})),
      getDamageStatistics: vi.fn(() => ({})),
      getDamageRollDistribution: runtimeClient.calculate,
    })
    const firstClient = createClient(firstGuard)
    const secondClient = createClient(secondGuard)
    const params = {
      action: {
        score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
        damage: { dice: 0, value: 0, kazanari: 0 },
      },
      reaction: {
        mode: 'ドッジ',
        score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
        damage: { dice: 0, value: 0 },
      },
    }
    const firstController = new AbortController()
    const first = firstClient.calculateAttack(params, {
      signal: firstController.signal,
    })
    await vi.waitFor(() => expect(workers).toHaveLength(1))

    const second = secondClient.calculateAttack(params)
    const worker = workers[0]
    expect(worker.messages).toHaveLength(1)
    expect(firstGuard.snapshot().activeCount).toBe(1)
    expect(secondGuard.snapshot().activeCount).toBe(1)

    firstController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(firstGuard.snapshot().activeCount).toBe(0)
    expect(secondGuard.snapshot().activeCount).toBe(1)

    worker.respond(0, distributionAt(0, 8))
    await expect(second).resolves.toEqual(expect.objectContaining({
      damage: envelope,
    }))
    expect(secondGuard.snapshot().activeCount).toBe(0)
  })
})
