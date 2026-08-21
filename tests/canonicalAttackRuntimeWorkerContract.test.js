import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/application/CalculationClient'
import { createRuntimeDamageRollClient } from '../src/application/RuntimeDamageRollClient'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'

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
}

function canonicalEnvelope() {
  return Object.freeze({
    result: createDistributionResult({
      values: [1],
      offset: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    }),
    metadata: Object.freeze({
      modeledDistribution: true,
      sourceSupport: { kind: 'finite', max: 0 },
    }),
  })
}

function attackParams() {
  return {
    action: {
      score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      damage: { dice: 0, value: 3, kazanari: 4 },
    },
    reaction: {
      mode: 'guard',
      score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      damage: { dice: 0, value: 1 },
    },
  }
}

function createHarness() {
  const workers = []
  const runtimeDamageRollClient = createRuntimeDamageRollClient({
    workerFactory: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
  })
  const calculateCanonicalDamageOnDemand = vi.fn(async (
    _score,
    attack,
    _defence,
    damageDependencies
  ) => {
    await damageDependencies.getDamageRollDistribution(
      new Float64Array([1]),
      attack.kazanari
    )
    return canonicalEnvelope()
  })
  const release = vi.fn()
  const client = createCalculationClient({
    calculateCanonicalDamageOnDemand,
    calculateDamageOnDemand: vi.fn(),
    calculateScoreCanonical: vi.fn(() => canonicalEnvelope()),
    getCanonicalDamageSummary: vi.fn(() => 'canonical summary'),
    getCanonicalTotalDamageSummary: vi.fn(() => 'total summary'),
    getDamageRollDistribution: runtimeDamageRollClient.calculate,
    getScore: vi.fn(() => ({ action: { distribution: [1] } })),
    getScoreSummary: vi.fn(() => 'score summary'),
    loadD10Asset: vi.fn(async () => {}),
    planCalculationRanges: vi.fn(() => ({
      accepted: true,
      operation: 'attack',
    })),
    planCanonicalDamageAggregation: vi.fn(() => ({
      operation: 'canonical-damage-aggregation',
    })),
    resourceGuard: {
      acquirePlan: vi.fn(() => ({ release })),
    },
    sumCanonicalDamage: vi.fn(() => canonicalEnvelope()),
  })
  return {
    calculateCanonicalDamageOnDemand,
    client,
    runtimeDamageRollClient,
    workers,
  }
}

describe('canonical Attack runtime Worker boundary', () => {
  it('passes the existing RuntimeDamageRollClient provider through canonical batch', async () => {
    const harness = createHarness()
    const pending = harness.client.calculateAttackCanonicalBatch([
      { id: 'combo-1', params: attackParams() },
    ])

    expect(harness.workers).toHaveLength(1)
    expect(harness.workers[0].messages).toHaveLength(1)
    expect(harness.workers[0].messages[0].message).toMatchObject({
      kazanari: 4,
    })
    expect(harness.workers[0].messages[0].transfer).toHaveLength(1)

    const distribution = new Float64Array(2048)
    distribution[0] = 1
    harness.workers[0].emit('message', {
      data: {
        id: harness.workers[0].messages[0].message.id,
        distribution,
      },
    })

    const result = await pending
    expect(result.combos).toHaveLength(1)
    expect(result.combos[0].canonicalDamage).toEqual(
      expect.objectContaining({ result: expect.any(Object) })
    )
    expect(harness.calculateCanonicalDamageOnDemand).toHaveBeenCalledOnce()
    expect(harness.client.calculateAttackCombo).toBeTypeOf('function')
    harness.runtimeDamageRollClient.dispose()
  })
})
