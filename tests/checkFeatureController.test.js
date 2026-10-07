import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import {
  areCheckCalculationInputsEqual,
  createCheckCalculationRecord,
} from '../src/features/check/model/CheckCalculationRecord'
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
      forcedFailureProbability: 0,
    },
  }
}

function createCalculationResult({
  kind = 'fixed',
  scoreEnvelope = createScoreEnvelope(),
} = {}) {
  const lane = {
    expectedValue: { kind: 'exact', value: 0 },
    successProbability: { kind: 'exact', value: 1 },
  }
  if (kind === 'opposed') {
    return {
      kind,
      score: { action: scoreEnvelope, reaction: scoreEnvelope },
      scoreStatistics: { action: lane, reaction: lane },
    }
  }
  return {
    kind: 'fixed',
    score: { action: scoreEnvelope },
    scoreStatistics: { action: lane },
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
    calculateCheck: vi.fn(async (input) =>
      createCalculationResult({ kind: input.kind })
    ),
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
      kind: 'fixed',
      action: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      target: 0,
    })
    expect(client.calculateCheck.mock.calls[0][1]).toEqual({
      displayRequest: { min: 0, max: 30, mode: 'pmf' },
      rangePolicy: expect.any(Object),
      onRangePlan: expect.any(Function),
    })
    expect(check.resultReady.value).toBe(true)
    expect(check.calculationRecord.value).toMatchObject({
      input: {
        kind: 'fixed',
        target: 0,
      },
    })
  })

  it('keeps the owned calculation record across display-only changes and rejects', async () => {
    const { check, client } = await createController()
    const record = check.calculationRecord.value

    check.onDisplayValidated({ min: 0, max: 30, mode: 'upper-tail' })
    await Promise.resolve()
    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
    expect(check.calculationRecord.value).toBe(record)

    check.onDisplayValidated({ min: 0, max: 16_384, mode: 'pmf' })
    await Promise.resolve()
    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
    expect(check.calculationRecord.value).toBe(record)
    expect(check.displayFeedback.value.status).toBe('rejected')
  })

  it('detaches the input snapshot owned by a calculation record', () => {
    const input = {
      kind: 'opposed',
      action: { dice: 4, critical: 9, skill: 2, yousei: 0, shihai: 0 },
      reaction: { dice: 3, critical: 10, skill: -1, yousei: 0, shihai: 0 },
    }
    const result = createCalculationResult({ kind: 'opposed' })
    const record = createCheckCalculationRecord(input, result)

    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.input)).toBe(true)
    expect(Object.isFrozen(record.input.action)).toBe(true)
    expect(Object.isFrozen(record.input.reaction)).toBe(true)
    expect(areCheckCalculationInputsEqual(record.input, input)).toBe(true)
    input.action.dice = 99
    expect(record.input.action.dice).toBe(4)
    expect(areCheckCalculationInputsEqual(record.input, input)).toBe(false)
  })

  it('updates difficulty and submits a new canonical snapshot', async () => {
    const { check, client } = await createController()

    check.onDifficultyValidationState({
      status: 'valid',
      value: { opposed: true, target: 12 },
    })
    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledTimes(2))

    expect(check.difficulty.value).toEqual({ opposed: true, target: 12 })
    expect(client.calculateCheck.mock.calls[1][0]).toEqual({
      kind: 'opposed',
      action: check.scoreParams.value.action,
      reaction: check.scoreParams.value.reaction,
    })
  })

  it('updates only the validated score side', async () => {
    const { check, client } = await createController()

    check.onScoreValidationState({
      side: 'action',
      state: { status: 'valid', value: { dice: 4, critical: 9, skill: 2, yousei: 0, shihai: 0 } },
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

  it('owns independent advanced settings state and enforces disabled values', async () => {
    const { check, client } = await createController()

    expect(check.advancedSettingsEnabled.value).toEqual({
      action: false,
      reaction: false,
    })
    check.onScoreValidationState({
      side: 'action',
      state: { status: 'valid', value: { dice: 4, critical: 9, skill: 2, yousei: 3, shihai: 2 } },
    })
    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledTimes(2))
    expect(check.scoreParams.value.action).toMatchObject({ yousei: 0, shihai: 0 })
    expect(client.calculateCheck.mock.calls[1][0].action)
      .toMatchObject({ yousei: 0, shihai: 0 })

    check.onAdvancedSettingsChanged({ side: 'action', enabled: true })
    expect(client.calculateCheck).toHaveBeenCalledTimes(2)
    check.onScoreValidationState({
      side: 'action',
      state: { status: 'valid', value: { dice: 4, critical: 9, skill: 2, yousei: 3, shihai: 0 } },
    })
    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledTimes(3))
    expect(check.scoreParams.value.action.yousei).toBe(3)

    check.onAdvancedSettingsChanged({ side: 'reaction', enabled: true })
    expect(check.advancedSettingsEnabled.value).toEqual({ action: true, reaction: true })
    check.onAdvancedSettingsChanged({ side: 'action', enabled: false })
    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledTimes(4))
    expect(check.scoreParams.value.action).toMatchObject({ yousei: 0, shihai: 0 })
    check.onAdvancedSettingsChanged({ side: 'action', enabled: true })
    expect(client.calculateCheck).toHaveBeenCalledTimes(4)
    expect(check.scoreParams.value.action).toMatchObject({ yousei: 0, shihai: 0 })
    expect(check.scoreParams.value.reaction).toMatchObject({ yousei: 0, shihai: 0 })
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

    expect(client.calculateCheck.mock.calls[1][1].displayRequest)
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

  it('invalidates stale results across a rejected display and input change', async () => {
    const pending = []
    const client = {
      calculateCheck: vi.fn()
        .mockResolvedValueOnce(createCalculationResult())
        .mockImplementation((input) => new Promise((resolve) => {
          pending.push({ input, resolve })
        })),
    }
    const check = await useCheck({ calculationClient: client })

    check.onDisplayValidated({ min: 0, max: 16_384, mode: 'pmf' })
    await Promise.resolve()
    expect(check.resultReady.value).toBe(true)

    check.onScoreValidationState({
      side: 'action',
      state: { status: 'valid', value: { dice: 2, critical: 10, skill: 0, yousei: 0, shihai: 0 } },
    })
    expect(check.resultReady.value).toBe(false)
    expect(check.score.value).toBeNull()

    check.onDisplayValidated({ min: 0, max: 100, mode: 'pmf' })
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0].input.action.dice).toBe(2)

    pending[0].resolve(createCalculationResult())
    await vi.waitFor(() => expect(check.resultReady.value).toBe(true))
    expect(check.scoreParams.value.action.dice).toBe(2)
  })

  it('keeps only the latest calculation result when requests overlap', async () => {
    const pending = []
    const client = {
      calculateCheck: vi.fn()
        .mockResolvedValueOnce(createCalculationResult())
        .mockImplementation((input) => new Promise((resolve) => {
          pending.push({ input, resolve })
        })),
    }
    const check = await useCheck({ calculationClient: client })

    check.onScoreValidationState({
      side: 'action',
      state: { status: 'valid', value: { dice: 2, critical: 10, skill: 0, yousei: 0, shihai: 0 } },
    })
    check.onScoreValidationState({
      side: 'action',
      state: { status: 'valid', value: { dice: 3, critical: 10, skill: 0, yousei: 0, shihai: 0 } },
    })
    await vi.waitFor(() => expect(pending).toHaveLength(1))

    expect(pending[0].input.action.dice).toBe(2)
    pending[0].resolve(createCalculationResult())
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].input.action.dice).toBe(3)
    pending[1].resolve(createCalculationResult())
    await vi.waitFor(() => expect(check.resultReady.value).toBe(true))
  })

  it('invalidates an in-flight request as soon as a draft becomes invalid', async () => {
    const pending = []
    const client = {
      calculateCheck: vi.fn((input, options) => {
        if (pending.length === 0 && client.calculateCheck.mock.calls.length === 1) {
          return Promise.resolve(createCalculationResult({ kind: input.kind }))
        }
        return new Promise((resolve) => {
          pending.push({ input, resolve, signal: options.signal })
        })
      }),
    }
    const check = await useCheck({ calculationClient: client })

    check.onScoreValidationState({
      side: 'action',
      state: {
        status: 'valid',
        value: { dice: 2, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      },
    })
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const staleRequest = pending[0]

    check.onScoreValidationState({
      side: 'action',
      state: { status: 'validating' },
    })
    expect(staleRequest.signal.aborted).toBe(true)
    check.onScoreValidationState({
      side: 'action',
      state: { status: 'invalid' },
    })
    staleRequest.resolve(createCalculationResult())
    await Promise.resolve()
    expect(check.calculationRecord.value).toBeNull()
    expect(check.resultReady.value).toBe(false)

    check.onScoreValidationState({
      side: 'action',
      state: {
        status: 'valid',
        value: { dice: 3, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      },
    })
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1].resolve(createCalculationResult())
    await vi.waitFor(() => expect(check.resultReady.value).toBe(true))
    expect(check.calculationRecord.value.input.action.dice).toBe(3)
  })

  it('does not recalculate from the last valid input while an active draft is invalid', async () => {
    const { check, client } = await createController()

    check.onScoreValidationState({
      side: 'action',
      state: { status: 'invalid' },
    })
    check.onDisplayValidated({ min: 0, max: 20, mode: 'upper-tail' })
    await Promise.resolve()

    expect(client.calculateCheck).toHaveBeenCalledTimes(1)
    expect(check.calculationRecord.value).toBeNull()
    expect(check.resultReady.value).toBe(false)
  })

})
