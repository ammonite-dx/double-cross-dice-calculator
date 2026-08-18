import { describe, expect, it, vi } from 'vitest'

import {
  CALCULATION_REQUEST_STATUS,
  createCalculationRequestCoordinator,
} from '../src/application/CalculationRequestCoordinator'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('CalculationRequestCoordinator', () => {
  it('limits a lane to one running request and replaces queued work with the latest snapshot', async () => {
    const first = createDeferred()
    const calls = []
    let firstSignal
    let running = 0
    let maximumRunning = 0
    const coordinator = createCalculationRequestCoordinator({
      execute: (snapshot, context) => {
        calls.push(snapshot)
        if (calls.length === 1) {
          firstSignal = context.signal
        }
        running += 1
        maximumRunning = Math.max(maximumRunning, running)
        if (calls.length === 1) {
          return first.promise.finally(() => {
            running -= 1
          })
        }
        running -= 1
        return Promise.resolve(snapshot)
      },
      commit: vi.fn(),
    })

    const firstRequest = coordinator.run({ id: 'first' })
    const replacedInput = { id: 'replaced', nested: { value: 2 } }
    const replacedRequest = coordinator.run(replacedInput)
    replacedInput.nested.value = 99
    const latestInput = { id: 'latest', nested: { value: 3 } }
    const latestRequest = coordinator.run(latestInput)
    latestInput.nested.value = 100

    expect(await replacedRequest).toBe(false)
    expect(firstSignal.aborted).toBe(false)
    expect(calls.map(({ id }) => id)).toEqual(['first'])
    expect(maximumRunning).toBe(1)
    expect(coordinator.snapshot()).toMatchObject({
      status: CALCULATION_REQUEST_STATUS.PENDING,
      activeRevision: 1,
      queuedRevision: 3,
    })

    first.resolve({ id: 'old result' })
    await expect(firstRequest).resolves.toBe(false)
    await expect(latestRequest).resolves.toBe(true)

    expect(calls.map(({ id }) => id)).toEqual(['first', 'latest'])
    expect(calls[1]).toEqual({ id: 'latest', nested: { value: 3 } })
    expect(maximumRunning).toBe(1)
    expect(coordinator.snapshot()).toMatchObject({
      status: CALCULATION_REQUEST_STATUS.SUCCESS,
      activeRevision: null,
      queuedRevision: null,
    })
  })

  it('suppresses stale plans, results, and errors after a newer request is queued', async () => {
    const first = createDeferred()
    let firstContext
    let callCount = 0
    const onPlan = vi.fn()
    const commit = vi.fn()
    const onError = vi.fn()
    const staleError = new Error('stale error')
    const coordinator = createCalculationRequestCoordinator({
      execute: (_snapshot, context) => {
        callCount += 1
        if (callCount === 1) {
          firstContext = context
          return first.promise
        }
        context.onRangePlan({ id: 'latest-plan' })
        return Promise.resolve({ id: 'latest-result' })
      },
      onPlan,
      commit,
      onError,
    })

    const firstRequest = coordinator.run({ id: 'first' })
    firstContext.onRangePlan({ id: 'old-plan-before-queue' })
    const latestRequest = coordinator.run({ id: 'latest' })
    firstContext.onRangePlan({ id: 'old-plan-after-queue' })
    first.reject(staleError)

    await expect(firstRequest).resolves.toBe(false)
    await expect(latestRequest).resolves.toBe(true)

    expect(onPlan).toHaveBeenCalledWith({ id: 'old-plan-before-queue' }, expect.anything())
    expect(onPlan).toHaveBeenCalledWith({ id: 'latest-plan' }, expect.anything())
    expect(onPlan).not.toHaveBeenCalledWith(
      { id: 'old-plan-after-queue' },
      expect.anything()
    )
    expect(commit).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith(
      { id: 'latest-result' },
      expect.objectContaining({ revision: 2 })
    )
    expect(onError).not.toHaveBeenCalledWith(
      staleError,
      expect.anything()
    )
  })

  it.each([
    [
      'error',
      () => new Error('snapshot failed'),
      CALCULATION_REQUEST_STATUS.ERROR,
    ],
    [
      'resource rejection',
      () => Object.assign(
        new Error('snapshot resource rejected'),
        { name: 'ResourceGuardError' }
      ),
      CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED,
    ],
  ])(
    'does not let stale active completion overwrite a newer snapshot %s state',
    async (_label, createSnapshotError, expectedStatus) => {
      const first = createDeferred()
      let snapshotCalls = 0
      const coordinator = createCalculationRequestCoordinator({
        snapshotRequest: (request) => {
          snapshotCalls += 1
          if (snapshotCalls === 2) {
            throw createSnapshotError()
          }
          return request
        },
        execute: () => first.promise,
      })

      const activeRequest = coordinator.run({ id: 'active' })
      const failedLatestRequest = coordinator.run({ id: 'failed-latest' })

      await expect(failedLatestRequest).resolves.toBe(false)
      expect(coordinator.snapshot().status).toBe(expectedStatus)

      first.resolve({ id: 'stale result' })
      await expect(activeRequest).resolves.toBe(false)
      expect(coordinator.snapshot().status).toBe(expectedStatus)
    }
  )

  it('starts the latest queued request after the running request fails', async () => {
    const first = createDeferred()
    const second = createDeferred()
    const errors = []
    let callCount = 0
    const coordinator = createCalculationRequestCoordinator({
      execute: () => {
        callCount += 1
        return callCount === 1 ? first.promise : second.promise
      },
      onError: (error) => errors.push(error),
      commit: vi.fn(),
    })

    const firstRequest = coordinator.run({ id: 'first' })
    const latestRequest = coordinator.run({ id: 'latest' })
    const firstError = new Error('old failure')
    first.reject(firstError)

    await expect(firstRequest).resolves.toBe(false)
    expect(callCount).toBe(2)
    second.resolve({ id: 'latest-result' })
    await expect(latestRequest).resolves.toBe(true)
    expect(errors).toEqual([])
  })

  it('handles external abort and dispose without committing late work', async () => {
    const externalController = new AbortController()
    const first = createDeferred()
    const commit = vi.fn()
    let receivedSignal
    const coordinator = createCalculationRequestCoordinator({
      execute: (_snapshot, context) => {
        receivedSignal = context.signal
        return first.promise
      },
      commit,
    })

    const request = coordinator.run(
      { id: 'aborted' },
      { signal: externalController.signal }
    )
    expect(receivedSignal).not.toBe(externalController.signal)
    externalController.abort()
    expect(receivedSignal.aborted).toBe(true)
    first.resolve({ id: 'late-result' })
    await expect(request).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
    expect(coordinator.snapshot().status).toBe(
      CALCULATION_REQUEST_STATUS.CANCELLED
    )

    const deferred = createDeferred()
    const disposedCoordinator = createCalculationRequestCoordinator({
      execute: () => deferred.promise,
      commit,
    })
    const runningRequest = disposedCoordinator.run({ id: 'running' })
    const queuedRequest = disposedCoordinator.run({ id: 'queued' })
    disposedCoordinator.dispose()
    await expect(runningRequest).resolves.toBe(false)
    deferred.resolve({ id: 'disposed-result' })

    await expect(queuedRequest).resolves.toBe(false)
    await expect(disposedCoordinator.run({ id: 'after-dispose' }))
      .resolves.toBe(false)
    expect(disposedCoordinator.snapshot()).toMatchObject({
      status: CALCULATION_REQUEST_STATUS.CANCELLED,
      disposed: true,
    })
  })

  it('exposes defensive state snapshots and resource-rejected status', async () => {
    const coordinator = createCalculationRequestCoordinator({
      execute: () => Promise.reject(Object.assign(
        new Error('resource rejected'),
        { name: 'ResourceGuardError' }
      )),
    })

    const before = coordinator.snapshot()
    before.status = 'mutated'
    await expect(coordinator.run({ id: 'resource' })).resolves.toBe(false)

    expect(coordinator.snapshot().status).toBe(
      CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED
    )
    expect(coordinator.snapshot().status).not.toBe(before.status)
  })
})
