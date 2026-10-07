import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import { useBacktrack } from '../src/features/backtrack/model/useBacktrack'

function createBacktrackResult(encroachment = 100) {
  const distribution = createDistributionResult({
    values: [1],
    offset: encroachment,
    support: { kind: 'finite', max: encroachment },
    overflow: null,
  })
  return {
    single: distribution,
    double: distribution,
    second: distribution,
  }
}

const initialParams = {
  encroachment: 100,
  lois: 7,
  elois: 0,
  dice: 0,
  value: 0,
  dlois: 'なし',
}

describe('Backtrack feature validation lifecycle', () => {
  let consoleWarn

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarn.mockRestore()
  })

  it('invalidates stale work immediately, clears invalid results, and recovers', async () => {
    const pending = []
    const client = {
      calculateBacktrack: vi.fn((params, options) => {
        if (client.calculateBacktrack.mock.calls.length === 1) {
          return Promise.resolve(createBacktrackResult(params.encroachment))
        }
        return new Promise((resolve) => {
          pending.push({ params, options, resolve })
        })
      }),
    }
    const controller = useBacktrack({ calculationClient: client })

    controller.onValidationState({ status: 'valid', value: initialParams })
    await vi.waitFor(() => expect(controller.resultReady.value).toBe(true))
    expect(controller.presentation.value).not.toBeNull()

    controller.onValidationState({
      status: 'valid',
      value: { ...initialParams, encroachment: 101 },
    })
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const staleRequest = pending[0]

    controller.onValidationState({ status: 'validating' })
    expect(staleRequest.options.signal.aborted).toBe(true)
    controller.onValidationState({ status: 'invalid' })
    expect(controller.presentation.value).toBeNull()
    expect(controller.resultReady.value).toBe(false)

    staleRequest.resolve(createBacktrackResult(101))
    await Promise.resolve()
    expect(controller.presentation.value).toBeNull()
    expect(controller.resultReady.value).toBe(false)

    controller.onValidationState({
      status: 'valid',
      value: { ...initialParams, encroachment: 102 },
    })
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1].resolve(createBacktrackResult(102))
    await vi.waitFor(() => expect(controller.resultReady.value).toBe(true))
    expect(controller.params.value.encroachment).toBe(102)
    expect(controller.presentation.value).not.toBeNull()
  })
})
