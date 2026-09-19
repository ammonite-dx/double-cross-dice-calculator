import { describe, expect, it, vi } from 'vitest'

import {
  CALCULATION_REQUEST_STATUS,
  createCalculationRequestCoordinator,
} from '../src/runtime/CalculationRequestCoordinator'

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
    let firstSettled = false
    firstRequest.then(() => {
      firstSettled = true
    })
    const replacedInput = { id: 'replaced', nested: { value: 2 } }
    const replacedRequest = coordinator.run(replacedInput)
    replacedInput.nested.value = 99
    const latestInput = { id: 'latest', nested: { value: 3 } }
    const latestRequest = coordinator.run(latestInput)
    latestInput.nested.value = 100

    expect(await replacedRequest).toBe(false)
    expect(firstSignal.aborted).toBe(true)
    expect(firstSettled).toBe(false)
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

  it('deep-clones structured request values without cloning signals or promises', async () => {
    const controller = new AbortController()
    const promise = Promise.resolve('unchanged')
    const cycle = { label: 'cycle' }
    cycle.self = cycle
    const mapKey = { key: 'map' }
    const request = {
      date: new Date('2026-09-20T00:00:00.000Z'),
      regexp: /request/gi,
      buffer: new ArrayBuffer(8),
      view: new Uint16Array([1, 2, 3]),
      dataView: new DataView(new ArrayBuffer(4)),
      map: new Map([[mapKey, cycle]]),
      set: new Set([cycle]),
      signal: controller.signal,
      promise,
      cycle,
    }
    let snapshot
    const coordinator = createCalculationRequestCoordinator({
      execute: (value) => {
        snapshot = value
        return Promise.resolve('done')
      },
    })

    await expect(coordinator.run(request)).resolves.toBe(true)

    expect(snapshot).not.toBe(request)
    expect(snapshot.date).not.toBe(request.date)
    expect(snapshot.date).toEqual(request.date)
    expect(snapshot.regexp).not.toBe(request.regexp)
    expect(snapshot.regexp.source).toBe(request.regexp.source)
    expect(snapshot.buffer).not.toBe(request.buffer)
    expect(snapshot.view).not.toBe(request.view)
    expect(snapshot.view).toEqual(request.view)
    expect(snapshot.dataView).not.toBe(request.dataView)
    expect(snapshot.dataView.byteLength).toBe(request.dataView.byteLength)
    expect(snapshot.map).not.toBe(request.map)
    expect(snapshot.set).not.toBe(request.set)
    expect(snapshot.signal).toBe(controller.signal)
    expect(snapshot.promise).toBe(promise)
    expect(snapshot.cycle).toBe(snapshot.cycle.self)
    expect([...snapshot.map.values()][0]).toBe(snapshot.cycle)
    expect([...snapshot.set][0]).toBe(snapshot.cycle)
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
      let activeSignal
      const coordinator = createCalculationRequestCoordinator({
        snapshotRequest: (request) => {
          snapshotCalls += 1
          if (snapshotCalls === 2) {
            throw createSnapshotError()
          }
          return request
        },
        execute: (_request, context) => {
          activeSignal = context.signal
          return first.promise
        },
      })

      const activeRequest = coordinator.run({ id: 'active' })
      const failedLatestRequest = coordinator.run({ id: 'failed-latest' })

      await expect(failedLatestRequest).resolves.toBe(false)
      expect(coordinator.snapshot().status).toBe(expectedStatus)
      expect(activeSignal.aborted).toBe(true)

      first.resolve({ id: 'stale result' })
      await expect(activeRequest).resolves.toBe(false)
      expect(coordinator.snapshot().status).toBe(expectedStatus)
    }
  )

  it.each([
    [
      'error',
      () => new Error('latest snapshot failed'),
      CALCULATION_REQUEST_STATUS.ERROR,
    ],
    [
      'resource rejection',
      () => Object.assign(
        new Error('latest snapshot resource rejected'),
        { name: 'ResourceGuardError' }
      ),
      CALCULATION_REQUEST_STATUS.RESOURCE_REJECTED,
    ],
  ])(
    'cancels stale active and queued work after a latest snapshot %s',
    async (_label, createSnapshotError, expectedStatus) => {
      const first = createDeferred()
      let snapshotCalls = 0
      let executeCalls = 0
      let activeSignal
      const coordinator = createCalculationRequestCoordinator({
        snapshotRequest: (request) => {
          snapshotCalls += 1
          if (snapshotCalls === 3) {
            throw createSnapshotError()
          }
          return request
        },
        execute: (_request, context) => {
          executeCalls += 1
          activeSignal = context.signal
          return first.promise
        },
      })

      const activeRequest = coordinator.run({ id: 'active' })
      const queuedRequest = coordinator.run({ id: 'queued' })
      const failedLatestRequest = coordinator.run({ id: 'failed-latest' })

      await expect(failedLatestRequest).resolves.toBe(false)
      expect(activeSignal.aborted).toBe(true)
      await expect(queuedRequest).resolves.toBe(false)
      expect(executeCalls).toBe(1)
      expect(coordinator.snapshot().status).toBe(expectedStatus)

      first.resolve({ id: 'stale result' })
      await expect(activeRequest).resolves.toBe(false)
      expect(executeCalls).toBe(1)
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
    const onCancelled = vi.fn()
    let receivedSignal
    const coordinator = createCalculationRequestCoordinator({
      execute: (_snapshot, context) => {
        receivedSignal = context.signal
        return first.promise
      },
      commit,
      onCancelled,
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
    expect(onCancelled).toHaveBeenCalledWith(expect.objectContaining({
      request: { id: 'aborted' },
      signal: receivedSignal,
      options: { signal: externalController.signal },
    }))

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

  it('uses a null request and signal for synthetic invalidate/dispose cancellation', () => {
    const onCancelled = vi.fn()
    const coordinator = createCalculationRequestCoordinator({
      execute: () => new Promise(() => {}),
      onCancelled,
    })

    coordinator.run({ id: 'running' })
    coordinator.invalidate()

    expect(onCancelled).toHaveBeenLastCalledWith({
      revision: 2,
      request: null,
      signal: null,
      options: {},
    })

    const disposedCoordinator = createCalculationRequestCoordinator({
      execute: () => new Promise(() => {}),
      onCancelled,
    })
    disposedCoordinator.run({ id: 'running' })
    disposedCoordinator.dispose()

    expect(onCancelled).toHaveBeenLastCalledWith({
      revision: 2,
      request: null,
      signal: null,
      options: {},
    })
  })

  it('reports snapshot failures with a distinct context and drops stale work', async () => {
    const first = createDeferred()
    const activeSignal = { current: null }
    const onError = vi.fn()
    const execute = vi.fn((_request, context) => {
      activeSignal.current = context.signal
      return first.promise
    })
    const snapshotRequest = (request) => {
      if (request.id === 'failed') {
        throw new Error('snapshot failed')
      }
      return request
    }
    const coordinator = createCalculationRequestCoordinator({
      snapshotRequest,
      execute,
      onError,
    })

    const activeRequest = coordinator.run({ id: 'active' })
    const queuedRequest = coordinator.run({ id: 'queued' })
    const failedRequest = coordinator.run({ id: 'failed' })

    await expect(failedRequest).resolves.toBe(false)
    await expect(queuedRequest).resolves.toBe(false)
    expect(activeSignal.current.aborted).toBe(true)
    expect(execute).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    const [error, context] = onError.mock.calls[0]
    expect(error).toEqual(new Error('snapshot failed'))
    expect(context).toEqual({
      revision: 3,
      request: { id: 'failed' },
      options: {},
    })
    expect(context).not.toHaveProperty('signal')
    expect(context).not.toHaveProperty('onRangePlan')

    first.resolve({ id: 'stale result' })
    await expect(activeRequest).resolves.toBe(false)
    expect(coordinator.snapshot().status).toBe(CALCULATION_REQUEST_STATUS.ERROR)
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
