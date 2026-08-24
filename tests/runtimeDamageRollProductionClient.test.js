import { describe, expect, it, vi } from 'vitest'

import {
  createRuntimeDamageRollClient,
} from '../src/application/RuntimeDamageRollClient'

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

    expect(worker.messages).toHaveLength(2)
    expect(worker.messages[0].message.options.rawSupportMax).toBe(10)
    expect(worker.messages[1].message.options.rawSupportMax).toBe(12)

    worker.respond(0, distributionAt(1, 8))
    worker.respond(1, distributionAt(2, 8))
    await expect(first).resolves.toEqual(distributionAt(1, 8))
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

    expect(worker.messages).toHaveLength(3)
    requests.forEach((request, index) => {
      worker.respond(index, distributionAt(index + 1))
    })
    await Promise.all(requests)
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
})
