import { describe, expect, it, vi } from 'vitest'

import {
  CalculationRangeError,
  createCalculationClient,
} from '../src/runtime/CalculationClient'

function createPlan() {
  return {
    accepted: true,
    operation: 'backtrack',
    backtrack: {
      calculationMode: 'complete-support',
      distributionMode: 'on-demand',
      workingMax: 0,
      workingLength: 1,
      fftLength: 0,
    },
  }
}

function createDependencies(plan, Result = 'canonical-result') {
  const release = vi.fn()
  const resourceGuard = {
    acquirePlan: vi.fn(() => ({ release })),
  }
  return {
    planCalculationRanges: vi.fn(() => plan),
    resourceGuard,
    getFinalEncroachment: vi.fn(() => Result),
    release,
  }
}

const params = {
  encroachment: 79,
  lois: 1,
  elois: 2,
  dice: 3,
  value: 20,
  dlois: 'なし',
}

describe('CalculationClient.calculateBacktrack', () => {
  it('snapshots input, preflights, acquires/releases the canonical plan', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const client = createCalculationClient(dependencies)
    const signal = new AbortController().signal
    const onRangePlan = vi.fn()
    const options = {
      signal,
      requestId: 'canonical-backtrack-1',
      rangePolicy: { calculationMax: 17 },
      onRangePlan,
    }

    await expect(client.calculateBacktrack(params, options))
      .resolves.toBe('canonical-result')

    const request = dependencies.planCalculationRanges.mock.calls[0][0]
      .backtrack
    expect(request).toEqual(params)
    expect(request).not.toBe(params)
    expect(dependencies.planCalculationRanges).toHaveBeenCalledWith(
      {
        operation: 'backtrack',
        completeSupportBacktrack: true,
        backtrack: request,
      },
      options.rangePolicy
    )
    expect(onRangePlan).toHaveBeenCalledWith(plan)
    expect(dependencies.resourceGuard.acquirePlan).toHaveBeenCalledWith(
      plan,
      {
        signal,
        requestId: options.requestId,
        operation: 'backtrack',
      }
    )
    expect(plan.backtrack.calculationMode).toBe('complete-support')
    expect(plan.backtrack.distributionMode).toBe('on-demand')
    expect(dependencies.getFinalEncroachment).toHaveBeenCalledWith(
      request,
      { signal, requestId: options.requestId },
      plan.backtrack
    )
    expect(dependencies.release).toHaveBeenCalledOnce()
  })

  it('runs a complete on-demand plan directly', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const client = createCalculationClient(dependencies)

    await expect(client.calculateBacktrack({
      ...params,
      dice: 103,
    })).resolves.toBe('canonical-result')

    expect(dependencies.getFinalEncroachment).toHaveBeenCalledOnce()
    expect(dependencies.release).toHaveBeenCalledOnce()
  })

  it('rejects before acquiring, loading, or calculating when preflight rejects', async () => {
    const plan = {
      accepted: false,
      rejectionReasons: ['estimated-memory'],
      warnings: [{ code: 'estimated-memory', severity: 'reject' }],
    }
    const dependencies = createDependencies(plan)
    const client = createCalculationClient(dependencies)

    await expect(client.calculateBacktrack(params))
      .rejects.toBeInstanceOf(CalculationRangeError)

    expect(dependencies.resourceGuard.acquirePlan).not.toHaveBeenCalled()
    expect(dependencies.getFinalEncroachment).not.toHaveBeenCalled()
    expect(dependencies.release).not.toHaveBeenCalled()
  })

  it('aborts after lease acquisition before calculating', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const client = createCalculationClient(dependencies)
    const controller = new AbortController()
    controller.abort()

    await expect(client.calculateBacktrack(params, {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(dependencies.getFinalEncroachment).not.toHaveBeenCalled()
    expect(dependencies.release).toHaveBeenCalledOnce()
  })

  it('releases the lease when the canonical producer fails', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const error = new Error('canonical failure')
    dependencies.getFinalEncroachment.mockImplementation(() => {
      throw error
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateBacktrack(params))
      .rejects.toBe(error)
    expect(dependencies.release).toHaveBeenCalledOnce()
  })
})
