import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import { useCheck } from '../src/features/check/model/useCheck'

function createScoreEnvelope({
  values = [1],
  support = { kind: 'finite', max: 0 },
} = {}) {
  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support,
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      failureProbability: 0,
    },
  }
}

function createCalculationResult({
  scoreEnvelope = createScoreEnvelope(),
} = {}) {
  const lane = {
    expectedValue: { kind: 'exact', value: 0 },
    successRate: { kind: 'exact', value: 1 },
  }
  return {
    score: { action: scoreEnvelope, reaction: scoreEnvelope },
    scoreSummary: { action: lane, reaction: lane },
  }
}

function createExpandedCoverageResult() {
  const values = Array.from({ length: 41 }, (_, index) =>
    index === 0 ? 1 : 0
  )
  return createCalculationResult({
    scoreEnvelope: createScoreEnvelope({
      values,
      support: { kind: 'finite', max: 40 },
    }),
  })
}

function createPartialCoverageResult() {
  const values = Array.from({ length: 31 }, (_, index) =>
    index === 0 ? 1 : 0
  )
  return createCalculationResult({
    scoreEnvelope: createScoreEnvelope({
      values,
      support: { kind: 'finite', max: 40 },
    }),
  })
}

async function createController() {
  const client = {
    calculateCheck: vi.fn(async () => createCalculationResult()),
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

    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
    expect(client.calculateCheck.mock.calls[0][0]).toMatchObject({
      action: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      reaction: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    })
    expect(client.calculateCheck.mock.calls[0][1]).toEqual({
      opposed: false,
      target: 0,
    })
    expect(client.calculateCheck.mock.calls[0][2].displayRequest).toEqual({
      min: 0,
      max: 30,
      mode: 'pmf',
    })
    expect(check.resultReady.value).toBe(true)
  })

  it('updates difficulty and submits a new canonical snapshot', async () => {
    const { check, client } = await createController()

    check.onDifficultyValidated({ opposed: true, target: 12 })
    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledTimes(2))

    expect(check.difficulty.value).toEqual({ opposed: true, target: 12 })
    expect(client.calculateCheck.mock.calls[1][1]).toEqual({
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
    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledTimes(2))

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
    expect(client.calculateCheck.mock.calls[1][0].action).toEqual(
      check.scoreParams.value.action
    )
  })

  it('reuses the score when only the display mode changes', async () => {
    const { check, client } = await createController()

    check.onDisplayValidated({ min: 0, max: 30, mode: 'upper-tail' })
    await Promise.resolve()

    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
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

    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
    expect(check.displayFeedback.value.status).toBe('idle')
  })

  it('recalculates once when an expanded display window needs missing coverage', async () => {
    const expandedResult = createExpandedCoverageResult()
    const client = {
      calculateCheck: vi.fn()
        .mockResolvedValueOnce(createPartialCoverageResult())
        .mockResolvedValueOnce(expandedResult),
    }
    const check = await useCheck({ calculationClient: client })

    check.onDisplayValidated({ min: 0, max: 40, mode: 'pmf' })
    await vi.waitFor(() => expect(
      client.calculateCheck
    ).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(check.displayFeedback.value.status).toBe('idle'))

    expect(client.calculateCheck.mock.calls[1][2].displayRequest)
      .toMatchObject({ min: 0, max: 40, mode: 'pmf' })
    expect(check.displayRequest.value).toEqual({
      min: 0,
      max: 40,
      mode: 'pmf',
    })
    expect(check.resultReady.value).toBe(true)
    expect(check.presentation.value.status).toBe('ready')
  })

  it('stops after one recalculation when the same window remains uncovered', async () => {
    const client = {
      calculateCheck: vi.fn()
        .mockResolvedValueOnce(createPartialCoverageResult())
        .mockResolvedValueOnce(createPartialCoverageResult()),
    }
    const check = await useCheck({ calculationClient: client })

    check.onDisplayValidated({ min: 0, max: 40, mode: 'pmf' })
    await vi.waitFor(() => expect(
      client.calculateCheck
    ).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(check.displayFeedback.value.status).toBe('rejected'))

    await Promise.resolve()
    expect(client.calculateCheck).toHaveBeenCalledTimes(2)
    expect(check.displayFeedback.value.plan).toMatchObject({
      accepted: false,
      decision: 'terminal',
      reason: 'display-terminal',
    })
    expect(check.displayFeedback.value.plan.rejectionReasons.length).toBeGreaterThan(0)
  })

  it('rejects a display window before invoking the calculation client', async () => {
    const { check, client } = await createController()

    check.onDisplayValidated({ min: 0, max: 16_384, mode: 'pmf' })
    await Promise.resolve()

    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
    expect(check.displayFeedback.value.status).toBe('rejected')
    expect(check.displayFeedback.value.plan.rejectionReasons).toContain(
      'display-point-count'
    )
  })

  it('keeps only the latest calculation result when requests overlap', async () => {
    const pending = []
    const client = {
      calculateCheck: vi.fn()
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
