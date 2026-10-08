import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent } from 'vue'

import { createDistributionResult } from '../src/calculation/DistributionResult'
import {
  areCheckCalculationInputsEqual,
  createCheckCalculationRecord,
} from '../src/features/check/model/CheckCalculationRecord'
import { useCheck } from '../src/features/check/model/useCheck'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createHostNode(type, text = '') {
  return { type, text, children: [], parent: null, props: {} }
}

const testRenderer = createRenderer({
  patchProp(element, key, _previousValue, nextValue) {
    element.props[key] = nextValue
  },
  insert(node, parent, anchor = null) {
    if (node.parent !== null) {
      const previousIndex = node.parent.children.indexOf(node)
      if (previousIndex >= 0) {
        node.parent.children.splice(previousIndex, 1)
      }
    }
    const anchorIndex = anchor === null ? -1 : parent.children.indexOf(anchor)
    if (anchorIndex < 0) {
      parent.children.push(node)
    } else {
      parent.children.splice(anchorIndex, 0, node)
    }
    node.parent = parent
  },
  remove(node) {
    if (node.parent === null) {
      return
    }
    const index = node.parent.children.indexOf(node)
    if (index >= 0) {
      node.parent.children.splice(index, 1)
    }
    node.parent = null
  },
  createElement: (type) => createHostNode(type),
  createText: (text) => createHostNode('text', text),
  createComment: (text) => createHostNode('comment', text),
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
    node.children = []
  },
  parentNode: (node) => node.parent,
  nextSibling(node) {
    if (node.parent === null) {
      return null
    }
    const index = node.parent.children.indexOf(node)
    return node.parent.children[index + 1] ?? null
  },
})

const mountedControllers = new Set()

function mountCheckController(client) {
  let check
  const rootComponent = defineComponent({
    setup() {
      check = useCheck({ calculationClient: client })
      return () => null
    },
  })
  const app = testRenderer.createApp(rootComponent)
  app.mount(createHostNode('root'))
  const mounted = {
    check,
    unmount() {
      if (!mountedControllers.has(mounted)) {
        return
      }
      mountedControllers.delete(mounted)
      app.unmount()
    },
  }
  mountedControllers.add(mounted)
  return mounted
}

async function mountReadyCheckController(client) {
  const mounted = mountCheckController(client)
  await vi.waitFor(() => expect(mounted.check.resultReady.value).toBe(true))
  return mounted
}

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
  const mounted = await mountReadyCheckController(client)
  return { ...mounted, client }
}

describe('useCheck', () => {
  let consoleWarn

  beforeEach(() => {
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const mounted of mountedControllers) {
      mounted.unmount()
    }
    consoleWarn.mockRestore()
    vi.restoreAllMocks()
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
      signal: expect.any(AbortSignal),
    })
    expect(check.resultReady.value).toBe(true)
    expect(check.calculationRecord.value).toMatchObject({
      input: {
        kind: 'fixed',
        target: 0,
      },
    })
  })

  it('aborts the mounted initial request and ignores late plans and results after unmount', async () => {
    const deferred = createDeferred()
    let calculationOptions
    const client = {
      calculateCheck: vi.fn((_input, options) => {
        calculationOptions = options
        return deferred.promise
      }),
    }
    const mounted = mountCheckController(client)
    const { check } = mounted

    await vi.waitFor(() => expect(client.calculateCheck).toHaveBeenCalledOnce())
    expect(check.rangeFeedback.value.status).toBe('loading')
    expect(check.calculationRecord.value).toBeNull()

    mounted.unmount()

    expect(calculationOptions.signal.aborted).toBe(true)
    calculationOptions.onRangePlan({ accepted: true, id: 'late plan' })
    deferred.resolve(createCalculationResult())
    await Promise.resolve()
    await Promise.resolve()

    expect(check.rangeFeedback.value.status).toBe('idle')
    expect(check.rangeFeedback.value.plan).toBeNull()
    expect(check.calculationRecord.value).toBeNull()

    check.onScoreValidationState({
      side: 'action',
      state: {
        status: 'valid',
        value: { dice: 2, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      },
    })
    await Promise.resolve()
    expect(client.calculateCheck).toHaveBeenCalledOnce()
  })

  it.each([
    {
      label: 'calculation error',
      createError: () => new Error('initial calculation failed'),
      status: 'error',
    },
    {
      label: 'range rejection',
      createError: () => Object.assign(
        new Error('initial range rejected'),
        {
          name: 'CalculationRangeError',
          plan: {
            accepted: false,
            rejectionReasons: ['estimated-memory'],
            warnings: [],
            estimates: { float64Bytes: 65 * 1024 * 1024 },
          },
        },
      ),
      status: 'rejected',
    },
  ])('recovers from an initial $label through the normal input runner', async ({
    createError,
    status,
  }) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      calculateCheck: vi.fn()
        .mockRejectedValueOnce(createError())
        .mockResolvedValueOnce(createCalculationResult()),
    }
    const mounted = mountCheckController(client)
    const { check } = mounted

    await vi.waitFor(() => expect(check.rangeFeedback.value.status).toBe(status))
    expect(client.calculateCheck).toHaveBeenCalledOnce()
    expect(check.calculationRecord.value).toBeNull()

    check.onScoreValidationState({
      side: 'action',
      state: {
        status: 'valid',
        value: { dice: 2, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      },
    })

    await vi.waitFor(() => expect(check.resultReady.value).toBe(true))
    expect(client.calculateCheck).toHaveBeenCalledTimes(2)
    expect(check.calculationRecord.value.input.action.dice).toBe(2)
    consoleError.mockRestore()
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
    expect(client.calculateCheck).toHaveBeenCalledTimes(3)
    check.onScoreValidationState({
      side: 'action',
      state: {
        status: 'valid',
        value: { dice: 4, critical: 9, skill: 2, yousei: 3, shihai: 0 },
      },
    })
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
    const { check } = await mountReadyCheckController(client)

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
    const { check } = await mountReadyCheckController(client)

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
    const { check } = await mountReadyCheckController(client)

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
    const { check } = await mountReadyCheckController(client)

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
    const { check } = await mountReadyCheckController(client)

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
