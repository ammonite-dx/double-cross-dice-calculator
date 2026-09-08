import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import {
  createAbortError,
  createWorkerCalculationClient,
  R19_WORKER_OPERATIONS,
  serializeError,
} from '../experiments/r19-worker-architecture/worker-client.js'
import {
  CHECK_FIXTURES,
  R19_SUPERSESSION_SCENARIOS,
  R19_FIXTURE_IDS,
  R19_FIXTURES,
} from '../experiments/r19-worker-architecture/fixtures.js'
import { createHybridBenchmarkClient } from '../experiments/r19-worker-architecture/hybrid-client.js'
import {
  createResultDigest,
  estimateValueBytes,
} from '../experiments/r19-worker-architecture/result-digest.js'

class FakeWorker {
  constructor() {
    this.listeners = new Map()
    this.messages = []
    this.terminated = false
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    this.listeners.set(type, listeners.filter((entry) => entry !== listener))
  }

  postMessage(message) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(type, payload) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(payload)
    }
  }
}

describe('R19 generalized Worker protocol', () => {
  it('defines the four measured calculation operations', () => {
    expect(R19_WORKER_OPERATIONS).toEqual([
      'check',
      'attack',
      'totalDamage',
      'backtrack',
    ])
  })

  it('posts a request and resolves a matching success response', async () => {
    const worker = new FakeWorker()
    const client = createWorkerCalculationClient({
      workerFactory: () => worker,
    })
    const promise = client.calculate('check', { params: { value: 1 } })

    expect(worker.messages).toEqual([{
      id: 1,
      operation: 'check',
      args: { params: { value: 1 } },
      options: {},
    }])
    worker.emit('message', {
      data: {
        id: 1,
        type: 'success',
        result: { ok: true },
        workerTiming: { computeMs: 2 },
      },
    })

    await expect(promise).resolves.toMatchObject({
      result: { ok: true },
      transport: {
        workerTiming: { computeMs: 2 },
        callerAborted: false,
      },
    })
    expect(client.pendingCount).toBe(0)
  })

  it('reports a ready handshake for cold Worker startup', async () => {
    const worker = new FakeWorker()
    const client = createWorkerCalculationClient({
      workerFactory: () => worker,
    })
    const readyPromise = client.waitUntilReady()
    worker.emit('message', {
      data: {
        type: 'ready',
        workerTiming: { startupMs: 0.25 },
      },
    })

    await expect(readyPromise).resolves.toMatchObject({
      workerTiming: { startupMs: 0.25 },
    })
  })

  it('delivers plan messages before the result and isolates callback errors', async () => {
    const worker = new FakeWorker()
    const plans = []
    const client = createWorkerCalculationClient({
      workerFactory: () => worker,
    })
    const promise = client.calculate(
      'backtrack',
      { params: { dlois: 'なし' } },
      {
        onRangePlan: (plan) => {
          plans.push(plan)
          throw new Error('diagnostic callback failure')
        },
      }
    )
    worker.emit('message', { data: { id: 1, type: 'plan', plan: { accepted: true } } })
    worker.emit('message', { data: { id: 1, type: 'success', result: { ok: true } } })

    await expect(promise).resolves.toMatchObject({ result: { ok: true } })
    expect(plans).toEqual([{ accepted: true }])
  })

  it('rejects an aborted caller immediately while retaining the underlying request', async () => {
    const worker = new FakeWorker()
    const client = createWorkerCalculationClient({
      workerFactory: () => worker,
    })
    const controller = new AbortController()
    const promise = client.calculate(
      'attack',
      { params: { id: 'stale' } },
      { signal: controller.signal }
    )
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.pendingCount).toBe(1)
    worker.emit('message', {
      data: { id: 1, type: 'success', result: { stale: true } },
    })
    expect(client.pendingCount).toBe(0)
  })

  it('recreates the Worker after a transport failure', async () => {
    const workers = []
    const client = createWorkerCalculationClient({
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
    })
    const first = client.calculate('check', {})
    workers[0].emit('error', { message: 'crashed' })
    await expect(first).rejects.toThrow('crashed')
    expect(workers[0].terminated).toBe(true)

    const second = client.calculate('check', {})
    expect(workers).toHaveLength(2)
    workers[1].emit('message', {
      data: { id: 2, type: 'success', result: { recovered: true } },
    })
    await expect(second).resolves.toMatchObject({ result: { recovered: true } })
  })

  it('serializes typed calculation errors without exposing a stack contract', () => {
    const error = Object.assign(new Error('range rejected'), {
      name: 'CalculationRangeError',
      code: 'range-error',
      rejectionReasons: ['estimated-time'],
      plan: { accepted: false },
      stack: 'secret stack detail',
    })
    expect(serializeError(error)).toEqual({
      name: 'CalculationRangeError',
      message: 'range rejected',
      code: 'range-error',
      rejectionReasons: ['estimated-time'],
      plan: { accepted: false },
    })
    expect(createAbortError('check')).toMatchObject({
      name: 'AbortError',
      message: 'check calculation was aborted',
    })
  })

  it('keeps digest and byte estimates deterministic for transported results', () => {
    const result = {
      values: new Float64Array([0.25, 0.75]),
      nested: { status: 'ready' },
    }
    const cloned = structuredClone(result)
    expect(createResultDigest(result)).toBe(createResultDigest(cloned))
    expect(estimateValueBytes(result)).toBe(
      16
      + ('values'.length + 'nested'.length + 'status'.length) * 2
      + 8
    )
  })

  it('covers representative Check, Attack, Total Damage, and Backtrack fixtures', () => {
    expect(R19_FIXTURE_IDS).toHaveLength(R19_FIXTURES.length)
    expect(CHECK_FIXTURES.every(({ operation }) => operation === 'check')).toBe(true)
    expect(new Set(R19_FIXTURES.map(({ operation }) => operation))).toEqual(
      new Set(['check', 'attack', 'totalDamage', 'backtrack'])
    )
  })

  it('keeps supersession scenarios distinct and cache-neutral by construction', () => {
    expect(R19_SUPERSESSION_SCENARIOS).toHaveLength(2)
    const [attackToAttack, attackToCheck] = R19_SUPERSESSION_SCENARIOS
    expect(attackToAttack.stale.id).not.toBe(attackToAttack.latest.id)
    expect(attackToAttack.stale.params).not.toEqual(attackToAttack.latest.params)
    expect(attackToAttack.latest.operation).toBe('attack')
    expect(attackToCheck.stale.operation).toBe('attack')
    expect(attackToCheck.latest.operation).toBe('check')
    expect(attackToAttack.stale.params.action.damage.kazanari).toBeGreaterThan(0)
    expect(attackToAttack.latest.params.action.damage.kazanari).toBeGreaterThan(0)
  })

  it('wraps a fresh hybrid client with cache clear and disposal controls', () => {
    const damageRollClient = {
      calculate: vi.fn(),
      clearCache: vi.fn(),
      dispose: vi.fn(),
    }
    const client = createHybridBenchmarkClient({
      createDamageRollClient: () => damageRollClient,
    })

    client.clearDamageRollCache()
    client.dispose()

    expect(damageRollClient.clearCache).toHaveBeenCalledOnce()
    expect(damageRollClient.dispose).toHaveBeenCalledOnce()
    expect(typeof client.calculateAttack).toBe('function')
  })

  it('uses firstMeasured instead of the misleading cold metric', () => {
    const source = readFileSync(
      new URL('../experiments/r19-worker-architecture/benchmark.js', import.meta.url),
      'utf8'
    )
    expect(source).toContain('firstMeasured')
    expect(source).toContain("'damage-roll-cache-miss'")
    expect(source).not.toContain('cold: {')
  })

  it('reports transport callback settlement for stale requests', async () => {
    const worker = new FakeWorker()
    const settled = vi.fn()
    const client = createWorkerCalculationClient({
      workerFactory: () => worker,
    })
    const promise = client.calculate('check', {}, { onUnderlyingSettled: settled })
    worker.emit('message', { data: { id: 1, type: 'success', result: {} } })
    await promise
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  })
})
