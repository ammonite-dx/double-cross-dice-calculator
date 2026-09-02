import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import { useCheck } from '../src/features/check/model/useCheck'

function createScoreEnvelope() {
  return {
    result: createDistributionResult({
      values: [1],
      offset: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      failureProbability: 0,
    },
  }
}

function createCalculationResult() {
  const envelope = createScoreEnvelope()
  const lane = {
    expectedValue: { kind: 'exact', value: 0 },
    successRate: { kind: 'exact', value: 1 },
  }
  return {
    score: { action: envelope, reaction: envelope },
    scoreSummary: { action: lane, reaction: lane },
  }
}

async function createController() {
  const client = {
    calculateCheckCanonical: vi.fn(async () => createCalculationResult()),
  }
  const check = await useCheck({ calculationClient: client })
  return { check, client }
}

describe('useCheck', () => {
  let consoleWarn

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarn.mockRestore()
  })

  it('performs the initial canonical calculation with the default snapshot', async () => {
    const { check, client } = await createController()

    expect(client.calculateCheckCanonical).toHaveBeenCalledTimes(1)
    expect(client.calculateCheckCanonical.mock.calls[0][0]).toMatchObject({
      action: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      reaction: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    })
    expect(client.calculateCheckCanonical.mock.calls[0][1]).toEqual({
      opposed: false,
      target: 0,
    })
    expect(client.calculateCheckCanonical.mock.calls[0][2].displayRequest).toEqual({
      min: 0,
      max: 30,
      mode: 'pmf',
    })
    expect(check.resultReady.value).toBe(true)
  })

  it('updates difficulty and submits a new canonical snapshot', async () => {
    const { check, client } = await createController()

    check.onDifficultyValidated({ opposed: true, target: 12 })
    await vi.waitFor(() => expect(client.calculateCheckCanonical).toHaveBeenCalledTimes(2))

    expect(check.difficulty.value).toEqual({ opposed: true, target: 12 })
    expect(client.calculateCheckCanonical.mock.calls[1][1]).toEqual({
      opposed: true,
      target: 12,
    })
  })

  it('updates only the validated score side', async () => {
    const { check, client } = await createController()

    check.onScoreValidated({
      side: 'action',
      params: { dice: 4, critical: 9, skill: 2, yousei: 0, shihai: 0 },
    })
    await vi.waitFor(() => expect(client.calculateCheckCanonical).toHaveBeenCalledTimes(2))

    expect(check.scoreParams.value.action).toEqual({
      dice: 4,
      critical: 9,
      skill: 2,
      yousei: 0,
      shihai: 0,
    })
    expect(check.scoreParams.value.reaction).toEqual({
      dice: 1,
      critical: 10,
      skill: 0,
      yousei: 0,
      shihai: 0,
    })
    expect(client.calculateCheckCanonical.mock.calls[1][0].action).toEqual(
      check.scoreParams.value.action
    )
  })

  it('reuses the score when only the display mode changes', async () => {
    const { check, client } = await createController()

    check.onDisplayValidated({ min: 0, max: 30, mode: 'upper-tail' })
    await Promise.resolve()

    expect(client.calculateCheckCanonical).toHaveBeenCalledTimes(1)
    expect(check.displayRequest.value).toEqual({
      min: 0,
      max: 30,
      mode: 'upper-tail',
    })
  })

  it('reuses a finite score for a changed window that is already covered', async () => {
    const { check, client } = await createController()

    check.onDisplayValidated({ min: 0, max: 0, mode: 'pmf' })
    await Promise.resolve()

    expect(client.calculateCheckCanonical).toHaveBeenCalledTimes(1)
    expect(check.displayFeedback.value.status).toBe('idle')
  })

  it('rejects a display window before invoking the calculation client', async () => {
    const { check, client } = await createController()

    check.onDisplayValidated({ min: 0, max: 16_384, mode: 'pmf' })
    await Promise.resolve()

    expect(client.calculateCheckCanonical).toHaveBeenCalledTimes(1)
    expect(check.displayFeedback.value.status).toBe('rejected')
    expect(check.displayFeedback.value.plan.rejectionReasons).toContain(
      'display-point-count'
    )
  })

  it('keeps only the latest calculation result when requests overlap', async () => {
    const pending = []
    const client = {
      calculateCheckCanonical: vi.fn()
        .mockResolvedValueOnce(createCalculationResult())
        .mockImplementation((params) => new Promise((resolve) => {
          pending.push({ params, resolve })
        })),
    }
    const check = await useCheck({ calculationClient: client })

    check.onScoreValidated({
      side: 'action',
      params: { dice: 2, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    })
    check.onScoreValidated({
      side: 'action',
      params: { dice: 3, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    })
    await vi.waitFor(() => expect(pending).toHaveLength(1))

    expect(pending[0].params.action.dice).toBe(2)
    pending[0].resolve(createCalculationResult())
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].params.action.dice).toBe(3)
    pending[1].resolve(createCalculationResult())
    await vi.waitFor(() => expect(check.resultReady.value).toBe(true))
  })

  it('registers disposal for the latest-wins runner', async () => {
    const source = readFileSync(
      new URL('../src/features/check/model/useCheck.ts', import.meta.url),
      'utf8'
    )

    expect(source).toContain('onUnmounted(() => calculationRunner.dispose())')
  })
})
