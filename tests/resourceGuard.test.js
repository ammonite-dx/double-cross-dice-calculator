import { describe, expect, it, vi } from 'vitest'

import {
  CalculationRangeError,
  calculationDependencies,
  calculationResourceGuard,
  createCalculationClient,
  createCalculationDependencies,
} from '../src/runtime/CalculationClient'
import {
  DEFAULT_RESOURCE_GUARD_POLICY,
  ResourceGuard,
  ResourceGuardAbortError,
  ResourceGuardError,
  createResourceGuard,
} from '../src/runtime/ResourceGuard'
import { formatRangeFeedback } from '../src/runtime/CalculationFeedback'
import { createDistributionResult } from '../src/calculation/DistributionResult'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function scoreParams() {
  return {
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
  }
}

function createPlan(operation = 'check', float64Bytes = 1) {
  return {
    accepted: true,
    operation,
    estimates: {
      float64Bytes,
      operations: 12,
      timeMs: 3,
    },
    scores: operation === 'check'
      ? [{}, {}]
      : [{}, {}],
    backtrack: operation === 'backtrack'
      ? { distributionMode: 'asset' }
      : undefined,
  }
}

function createClientDependencies(overrides = {}) {
  const canonicalEnvelope = {
    result: createDistributionResult({
      values: [1],
      offset: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      failureProbability: 0,
      sourceSupport: { kind: 'finite', max: 0 },
    },
  }
  return {
    calculateCanonicalDamageOnDemand: vi.fn(async () => canonicalEnvelope),
    calculateScoreCanonical: vi.fn(() => canonicalEnvelope),
    getCanonicalDamageSummary: vi.fn(() => 'canonical damage summary'),
    getCanonicalScoreSummary: vi.fn(() => 'canonical score summary'),
    getCanonicalTotalDamageSummary: vi.fn(() => 'canonical total summary'),
    getDamageRollDistribution: vi.fn(),
    getD10Distribution: vi.fn(),
    getFinalEncroachmentCanonical: vi.fn(() => 'canonical backtrack'),
    planCalculationRanges: vi.fn((params) => createPlan(params.operation)),
    ...overrides,
  }
}

function checkParams() {
  return {
    action: scoreParams(),
    reaction: scoreParams(),
  }
}

function attackParams() {
  return {
    action: {
      score: scoreParams(),
      damage: { dice: 0, value: 0, kazanari: 0 },
    },
    reaction: {
      mode: 'ドッジ',
      score: scoreParams(),
      damage: { dice: 0, value: 0 },
    },
  }
}

function backtrackParams() {
  return {
    encroachment: 100,
    lois: 0,
    elois: 0,
    dice: 0,
    value: 0,
    dlois: 'なし',
  }
}

describe('ResourceGuard', () => {
  it('exposes the default policy and reserves a ceil-ed 1.5x estimate', async () => {
    const guard = createResourceGuard()
    const lease = await guard.acquire({
      operation: 'check',
      requestId: 'one',
      float64Bytes: 3.1,
      operations: 10,
      timeMs: 2,
    })

    expect(guard.policy).toEqual(DEFAULT_RESOURCE_GUARD_POLICY)
    expect(lease.metadata).toMatchObject({
      operation: 'check',
      requestId: 'one',
      float64Bytes: 3.1,
      reservedBytes: 5,
      operations: 10,
      timeMs: 2,
    })
    expect(guard.snapshot()).toMatchObject({
      reservedBytes: 5,
      activeCount: 1,
      queuedCount: 0,
    })
    expect(lease.release()).toBe(true)
    expect(lease.release()).toBe(false)
    expect(lease.released).toBe(true)
    expect(guard.snapshot()).toMatchObject({
      reservedBytes: 0,
      activeCount: 0,
      queuedCount: 0,
    })
  })

  it('admits requests in FIFO order under active and capacity limits', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 3,
      reservationMultiplier: 1,
    })
    const first = await guard.acquire({ float64Bytes: 6, requestId: 'first' })
    const secondPromise = guard.acquire({ float64Bytes: 4, requestId: 'second' })
    const thirdPromise = guard.acquire({ float64Bytes: 1, requestId: 'third' })

    expect(guard.snapshot()).toMatchObject({
      reservedBytes: 6,
      activeCount: 1,
      queuedCount: 2,
    })
    first.release()
    const second = await secondPromise
    expect(second.metadata.requestId).toBe('second')
    expect(guard.snapshot().queued[0].requestId).toBe('third')
    second.release()
    const third = await thirdPromise
    expect(third.metadata.requestId).toBe('third')
    third.release()
    expect(guard.snapshot().reservedBytes).toBe(0)
  })

  it('supports synchronous and queued Promise leases through the explicit APIs', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 1,
      reservationMultiplier: 1,
    })
    const planLease = guard.acquirePlan(createPlan('check', 2), {
      operation: 'check',
      requestId: 'plan',
    })

    expect(planLease).not.toBeInstanceOf(Promise)
    expect(planLease.metadata).toMatchObject({
      operation: 'check',
      requestId: 'plan',
      reservedBytes: 2,
    })
    planLease.release()

    const firstLease = guard.acquireLease({
      float64Bytes: 10,
      requestId: 'first',
    })
    expect(firstLease).not.toBeInstanceOf(Promise)
    const queuedLease = guard.acquireLease({
      float64Bytes: 1,
      requestId: 'queued',
    })

    expect(queuedLease).toBeInstanceOf(Promise)
    firstLease.release()
    const admittedLease = await queuedLease
    expect(admittedLease.metadata.requestId).toBe('queued')
    admittedLease.release()
    expect(guard.snapshot()).toMatchObject({
      reservedBytes: 0,
      activeCount: 0,
      queuedCount: 0,
    })
  })

  it('rejects oversize and full queues with typed errors', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 1,
      reservationMultiplier: 1.5,
    })
    const first = await guard.acquire({ float64Bytes: 6 })
    await expect(guard.acquire({ float64Bytes: 7 })).rejects.toMatchObject({
      name: 'ResourceGuardError',
      code: 'oversize',
    })
    const queued = guard.acquire({ float64Bytes: 1 })
    await expect(guard.acquire({ float64Bytes: 1 })).rejects.toMatchObject({
      name: 'ResourceGuardError',
      code: 'queue-full',
    })
    first.release()
    const queuedLease = await queued
    queuedLease.release()
    expect(guard.snapshot().reservedBytes).toBe(0)
  })

  it.each([
    ['capacityBytes', { capacityBytes: Number.NaN }],
    ['capacityBytes', { capacityBytes: -1 }],
    ['maxActive', { maxActive: 1.5 }],
    ['maxQueued', { maxQueued: -1 }],
  ])('rejects invalid policy %s values', (_field, policy) => {
    expect(() => new ResourceGuard(policy)).toThrow(ResourceGuardError)
    expect(() => new ResourceGuard(policy)).toThrow(/Resource guard/)
  })

  it('removes a queued request when its signal aborts', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 2,
      reservationMultiplier: 1,
    })
    const first = await guard.acquire({ float64Bytes: 10 })
    const controller = new AbortController()
    const pending = guard.acquire({ float64Bytes: 1, signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      code: 'aborted',
    })
    expect(guard.snapshot()).toMatchObject({
      reservedBytes: 10,
      activeCount: 1,
      queuedCount: 0,
    })
    first.release()
  })

  it('keeps an active reservation until the caller releases after abort', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 1,
      reservationMultiplier: 1,
    })
    const controller = new AbortController()
    const lease = await guard.acquire({
      float64Bytes: 10,
      signal: controller.signal,
    })
    controller.abort()

    expect(guard.snapshot()).toMatchObject({
      reservedBytes: 10,
      activeCount: 1,
    })
    lease.release()
    expect(guard.snapshot().reservedBytes).toBe(0)
  })

  it('removes the abort listener when a queued lease is admitted', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 1,
      reservationMultiplier: 1,
    })
    const first = await guard.acquire({ float64Bytes: 10 })
    const signal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const pending = guard.acquireLease({ float64Bytes: 1, signal })

    first.release()
    await pending
    expect(signal.addEventListener).toHaveBeenCalledOnce()
    expect(signal.removeEventListener).toHaveBeenCalledOnce()
    expect(guard.snapshot().reservedBytes).toBe(1)
  })
})

describe('CalculationClient resource guard integration', () => {
  it('shares the default singleton and isolates dependency-factory guards', () => {
    const first = createCalculationDependencies()
    const second = createCalculationDependencies()
    const injected = createResourceGuard({ capacityBytes: 1 })

    expect(calculationDependencies.resourceGuard)
      .toBe(calculationResourceGuard)
    expect(first.resourceGuard).not.toBe(calculationResourceGuard)
    expect(first.resourceGuard).not.toBe(second.resourceGuard)
    expect(createCalculationDependencies({ resourceGuard: injected }).resourceGuard)
      .toBe(injected)
  })

  it('accepts sync or Promise leases and releases canonical routes exactly once', async () => {
    const leases = []
    let planCallCount = 0
    const resourceGuard = {
      acquirePlan: vi.fn(() => {
        const lease = { release: vi.fn() }
        leases.push(lease)
        planCallCount += 1
        return planCallCount % 2 === 0
          ? Promise.resolve(lease)
          : lease
      }),
    }
    const client = createCalculationClient({
      ...createClientDependencies(),
      resourceGuard,
    })

    await client.calculateCheckCanonical(checkParams(), {})
    await client.calculateAttackCanonical(attackParams())
    await client.calculateBacktrackCanonical(backtrackParams())
    await client.calculateCanonicalTotalDamage([])

    expect(resourceGuard.acquirePlan).toHaveBeenCalledTimes(4)
    expect(leases).toHaveLength(4)
    expect(leases.every(({ release }) => release.mock.calls.length === 1))
      .toBe(true)
  })

  it.each([
    ['check', (client, options) => client.calculateCheckCanonical(checkParams(), {}, options)],
    ['attack', (client, options) => client.calculateAttackCanonical(attackParams(), options)],
    ['backtrack', (client, options) => client.calculateBacktrackCanonical(backtrackParams(), options)],
  ])('releases a plan lease when %s aborts after admission', async (_name, run) => {
    const controller = new AbortController()
    const release = vi.fn()
    const resourceGuard = {
      acquirePlan: vi.fn(() => {
        controller.abort()
        return { release }
      }),
    }
    const dependencies = createClientDependencies({ resourceGuard })
    const client = createCalculationClient(dependencies)

    await expect(run(client, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(release).toHaveBeenCalledOnce()
    expect(dependencies.calculateScoreCanonical).not.toHaveBeenCalled()
  })

  it('shares one guard across clients and preserves FIFO admission', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 2,
      reservationMultiplier: 1,
    })
    const loading = createDeferred()
    const dependencies = createClientDependencies({
      planCalculationRanges: vi.fn(() => createPlan('backtrack', 10)),
      getFinalEncroachmentCanonical: vi.fn(() => loading.promise),
    })
    const firstClient = createCalculationClient({
      ...dependencies,
      resourceGuard: guard,
    })
    const secondClient = createCalculationClient({
      ...dependencies,
      resourceGuard: guard,
    })
    const firstPromise = firstClient.calculateBacktrackCanonical(backtrackParams())
    const secondPromise = secondClient.calculateBacktrackCanonical(backtrackParams())

    await Promise.resolve()
    expect(guard.snapshot()).toMatchObject({
      activeCount: 1,
      queuedCount: 1,
      reservedBytes: 10,
    })
    loading.resolve('canonical backtrack')
    await expect(firstPromise).resolves.toBe('canonical backtrack')
    await expect(secondPromise).resolves.toBe('canonical backtrack')
    expect(guard.snapshot().reservedBytes).toBe(0)
  })

  it('does not reserve after a hard preflight rejection', async () => {
    const guard = createResourceGuard()
    const plan = {
      accepted: false,
      operation: 'check',
      rejectionReasons: ['estimated-memory'],
      estimates: { float64Bytes: 100 },
    }
    const dependencies = createClientDependencies({
      planCalculationRanges: vi.fn(() => plan),
    })
    const client = createCalculationClient({ ...dependencies, resourceGuard: guard })

    await expect(client.calculateCheckCanonical(checkParams(), {}))
      .rejects.toBeInstanceOf(CalculationRangeError)
    expect(dependencies.calculateScoreCanonical).not.toHaveBeenCalled()
    expect(guard.snapshot()).toMatchObject({
      activeCount: 0,
      queuedCount: 0,
      reservedBytes: 0,
    })
  })

  it.each([
    ['success', async (client) => client.calculateCheckCanonical(checkParams(), {})],
    ['runtime damage error', async (client) => client.calculateAttackCanonical({
      ...attackParams(),
      reaction: { ...attackParams().reaction, damage: { dice: 1, value: 0 } },
    })],
    ['worker error', async (client) => client.calculateAttackCanonical(attackParams())],
    ['synchronous error', async (client) => client.calculateCheckCanonical(checkParams(), {})],
  ])('releases the lease on %s', async (kind, run) => {
    const guard = new ResourceGuard({
      capacityBytes: 100,
      maxActive: 1,
      maxQueued: 1,
      reservationMultiplier: 1,
    })
    const overrides = {
      planCalculationRanges: vi.fn((params) => createPlan(params.operation, 10)),
    }
    if (kind === 'runtime damage error' || kind === 'worker error') {
      overrides.calculateCanonicalDamageOnDemand = vi.fn(async () => {
        throw new Error('worker failure')
      })
    }
    if (kind === 'synchronous error') {
      overrides.calculateScoreCanonical = vi.fn(() => {
        throw new Error('sync failure')
      })
    }
    const client = createCalculationClient({
      ...createClientDependencies(overrides),
      resourceGuard: guard,
    })
    if (kind === 'success') {
      await expect(run(client)).resolves.toBeTruthy()
    } else {
      await expect(run(client)).rejects.toThrow()
    }
    expect(guard.snapshot()).toMatchObject({
      activeCount: 0,
      queuedCount: 0,
      reservedBytes: 0,
    })
  })

  it('holds an active lease through cancellation and releases it in finally', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 100,
      maxActive: 1,
      maxQueued: 1,
      reservationMultiplier: 1,
    })
    const loading = createDeferred()
    const dependencies = createClientDependencies({
      planCalculationRanges: vi.fn(() => createPlan('backtrack', 10)),
      getFinalEncroachmentCanonical: vi.fn(() => loading.promise),
    })
    const client = createCalculationClient({ ...dependencies, resourceGuard: guard })
    const controller = new AbortController()
    const calculation = client.calculateBacktrackCanonical(backtrackParams(), {
      signal: controller.signal,
    })

    await Promise.resolve()
    controller.abort()
    expect(guard.snapshot().activeCount).toBe(1)
    loading.resolve()
    await expect(calculation).rejects.toMatchObject({ name: 'AbortError' })
    expect(guard.snapshot()).toMatchObject({
      activeCount: 0,
      queuedCount: 0,
      reservedBytes: 0,
    })
  })

  it('shows resource rejection details in the existing feedback formatter', async () => {
    const guard = new ResourceGuard({
      capacityBytes: 10,
      maxActive: 1,
      maxQueued: 0,
      reservationMultiplier: 1,
    })
    const active = await guard.acquire({ float64Bytes: 10 })
    const dependencies = createClientDependencies({
      planCalculationRanges: vi.fn(() => createPlan('check', 1)),
    })
    const client = createCalculationClient({ ...dependencies, resourceGuard: guard })
    const error = await client.calculateCheckCanonical(checkParams(), {})
      .catch((caughtError) => caughtError)
    const display = formatRangeFeedback({ status: 'error', error })

    expect(error.code).toBe('queue-full')
    expect(display).toMatchObject({ type: 'error' })
    expect(display.reasons.join(' ')).toContain('満杯')
    active.release()
  })

  it('formats oversize errors and suppresses guard AbortError feedback', () => {
    const oversize = new ResourceGuardError('oversize', 'too large', {
      reservedBytes: 12,
      capacityBytes: 10,
    })
    const oversizeDisplay = formatRangeFeedback({
      status: 'error',
      error: oversize,
    })

    expect(oversizeDisplay).toMatchObject({ type: 'error' })
    expect(oversizeDisplay.reasons.join(' ')).toContain('上限')
    expect(formatRangeFeedback({
      status: 'error',
      error: new ResourceGuardAbortError(),
    })).toBeNull()
  })

  it('leases canonical total damage through the same plan guard', async () => {
    const releases = []
    const resourceGuard = {
      acquirePlan: vi.fn(() => {
        const release = vi.fn()
        releases.push(release)
        return { release }
      }),
    }
    const client = createCalculationClient({
      ...createClientDependencies(),
      resourceGuard,
    })
    const attack = await client.calculateAttackCanonical(attackParams())

    await expect(client.calculateCanonicalTotalDamage([
      attack.canonicalDamage,
    ])).resolves.toMatchObject({
      canonicalTotalDamageSummary: 'canonical total summary',
    })
    expect(resourceGuard.acquirePlan).toHaveBeenCalledTimes(2)
    expect(releases).toHaveLength(2)
    expect(releases.every((release) => release.mock.calls.length === 1))
      .toBe(true)
  })
})
