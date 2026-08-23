import { describe, expect, it, vi } from 'vitest'

import {
  CalculationRangeError,
  createCalculationClient,
} from '../src/application/CalculationClient'

function createPlan() {
  return {
    accepted: true,
    operation: 'backtrack',
    backtrack: {
      calculationMode: 'canonical',
      distributionMode: 'on-demand',
      workingMax: 0,
      workingLength: 1,
      fftLength: 0,
    },
  }
}

function createDependencies(plan, canonicalResult = 'canonical-result') {
  const release = vi.fn()
  const resourceGuard = {
    acquirePlan: vi.fn(() => ({ release })),
  }
  return {
    planCalculationRanges: vi.fn(() => plan),
    resourceGuard,
    getFinalEncroachmentCanonical: vi.fn(() => canonicalResult),
    loadD10Asset: vi.fn(async () => {}),
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

describe('CalculationClient.calculateBacktrackCanonical', () => {
  it('snapshots input, preflights, acquires/releases the canonical plan, and never loads assets', async () => {
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

    await expect(client.calculateBacktrackCanonical(params, options))
      .resolves.toBe('canonical-result')

    const request = dependencies.planCalculationRanges.mock.calls[0][0]
      .backtrack
    expect(request).toEqual(params)
    expect(request).not.toBe(params)
    expect(dependencies.planCalculationRanges).toHaveBeenCalledWith(
      {
        operation: 'backtrack',
        canonicalBacktrack: true,
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
    expect(plan.backtrack.calculationMode).toBe('canonical')
    expect(plan.backtrack.distributionMode).toBe('on-demand')
    expect(dependencies.loadD10Asset).not.toHaveBeenCalled()
    expect(dependencies.getFinalEncroachmentCanonical).toHaveBeenCalledWith(
      request,
      { signal, requestId: options.requestId },
      plan.backtrack
    )
    expect(dependencies.release).toHaveBeenCalledOnce()
  })

  it('skips asset loading for a complete on-demand plan', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const client = createCalculationClient(dependencies)

    await expect(client.calculateBacktrackCanonical({
      ...params,
      dice: 103,
    })).resolves.toBe('canonical-result')

    expect(dependencies.loadD10Asset).not.toHaveBeenCalled()
    expect(dependencies.getFinalEncroachmentCanonical).toHaveBeenCalledOnce()
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

    await expect(client.calculateBacktrackCanonical(params))
      .rejects.toBeInstanceOf(CalculationRangeError)

    expect(dependencies.resourceGuard.acquirePlan).not.toHaveBeenCalled()
    expect(dependencies.loadD10Asset).not.toHaveBeenCalled()
    expect(dependencies.getFinalEncroachmentCanonical).not.toHaveBeenCalled()
    expect(dependencies.release).not.toHaveBeenCalled()
  })

  it('aborts after lease acquisition before loading or calculating', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const client = createCalculationClient(dependencies)
    const controller = new AbortController()
    controller.abort()

    await expect(client.calculateBacktrackCanonical(params, {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(dependencies.loadD10Asset).not.toHaveBeenCalled()
    expect(dependencies.getFinalEncroachmentCanonical).not.toHaveBeenCalled()
    expect(dependencies.release).toHaveBeenCalledOnce()
  })

  it('releases the lease when the canonical producer fails', async () => {
    const plan = createPlan()
    const dependencies = createDependencies(plan)
    const error = new Error('canonical failure')
    dependencies.getFinalEncroachmentCanonical.mockImplementation(() => {
      throw error
    })
    const client = createCalculationClient(dependencies)

    await expect(client.calculateBacktrackCanonical(params))
      .rejects.toBe(error)
    expect(dependencies.release).toHaveBeenCalledOnce()
  })
})
