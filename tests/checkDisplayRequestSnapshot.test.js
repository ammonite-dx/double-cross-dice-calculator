import { describe, expect, it } from 'vitest'

import {
  CHECK_DISPLAY_MODES,
  createCheckCalculationRequestSnapshot,
  createCheckDisplayRequestSnapshot,
} from '../src/features/check/model/CheckDisplayRequestSnapshot'
import {
  createCalculationFeedbackState,
  createLatestCalculationRunner,
} from '../src/runtime/CalculationFeedback'
import { LEGACY_PUBLISHED_OVERFLOW_INDEX } from '../src/calculation/DistributionResult'
import { planDisplayWindowResources } from '../src/shared/presentation'

function createInput() {
  return {
    difficulty: { opposed: true, target: 17 },
    params: {
      action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
      reaction: { dice: 5, critical: 9, skill: -2, yousei: 0, shihai: 4 },
    },
  }
}

describe('Check display request snapshot', () => {
  it('creates an alias-free validated snapshot for one display point', () => {
    const draft = {
      min: 1200,
      max: 1200,
      mode: CHECK_DISPLAY_MODES.PMF,
    }
    const snapshot = createCheckDisplayRequestSnapshot(draft)

    expect(snapshot).toEqual(draft)
    expect(snapshot).not.toBe(draft)
    expect(Object.isFrozen(snapshot)).toBe(true)

    draft.min = 0
    expect(snapshot.min).toBe(1200)
  })

  it('accepts only canonical display mode values', () => {
    expect(createCheckDisplayRequestSnapshot({
      min: 0,
      max: 1,
      mode: CHECK_DISPLAY_MODES.UPPER_TAIL,
    })).toEqual({
      min: 0,
      max: 1,
      mode: CHECK_DISPLAY_MODES.UPPER_TAIL,
    })
  })

  it('accepts ordinary getter properties during normalization', () => {
    let reads = 0
    const request = { min: 0, mode: CHECK_DISPLAY_MODES.PMF }
    Object.defineProperty(request, 'max', {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1
        return 1
      },
    })

    expect(createCheckDisplayRequestSnapshot(request)).toEqual({
      min: 0,
      max: 1,
      mode: CHECK_DISPLAY_MODES.PMF,
    })
    expect(reads).toBe(1)
  })

  it.each([
    { min: -1, max: 0, mode: CHECK_DISPLAY_MODES.PMF },
    { min: 0.5, max: 1, mode: CHECK_DISPLAY_MODES.PMF },
    { min: 0, max: Number.MAX_SAFE_INTEGER + 1, mode: CHECK_DISPLAY_MODES.PMF },
    { min: 2, max: 1, mode: CHECK_DISPLAY_MODES.PMF },
    { min: 0, max: 1, mode: '達成値がXとなる確率を表示' },
    { min: 0, max: 1, mode: '達成値がX以上となる確率を表示' },
    { min: 0, max: 1, mode: 'unknown' },
  ])('rejects malformed display request %o', (request) => {
    expect(() => createCheckDisplayRequestSnapshot(request)).toThrow()
  })

  it('deep-copies input, display request, and range policy for calculation', () => {
    const input = createInput()
    const policy = {
      calculationMax: 0,
      display: { maxPoints: 3 },
      limits: { hard: { workingLength: 4096 } },
    }
    const request = createCheckCalculationRequestSnapshot({
      ...input,
      displayRequest: {
        min: 0,
        max: 1200,
        mode: CHECK_DISPLAY_MODES.UPPER_TAIL,
      },
      rangePolicy: policy,
    })

    expect(request.rangePolicy.calculationMax).toBe(1200)
    expect(request.rangePolicy.display.maxPoints).toBe(1201)
    expect(request.rangePolicy.calculationMax)
      .toBeGreaterThanOrEqual(LEGACY_PUBLISHED_OVERFLOW_INDEX - 1)
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.params.action)).toBe(true)
    expect(Object.isFrozen(request.difficulty)).toBe(true)
    expect(Object.isFrozen(request.rangePolicy)).toBe(true)

    input.params.action.dice = 99
    policy.limits.hard.workingLength = 1
    expect(request.params.action.dice).toBe(7)
    expect(request.rangePolicy.limits.hard.workingLength).toBe(4096)
  })
})

describe('display resource preflight', () => {
  it('rejects resource overflow without requiring a canonical distribution', () => {
    const plan = planDisplayWindowResources({ min: 0, max: 1200 }, {
      warning: { pointCount: 100, float64Bytes: 800, chartPoints: 100 },
      hard: { pointCount: 1000, float64Bytes: 8000, chartPoints: 1000 },
    })

    expect(plan).toMatchObject({
      kind: 'display-window-resource-plan',
      accepted: false,
      status: 'resource-rejected',
      rejectionReasons: [
        'display-point-count',
        'display-float64-memory',
        'chart-point-count',
      ],
    })
    expect(plan.estimates).toEqual({
      pointCount: 1201,
      float64Bytes: 1201 * Float64Array.BYTES_PER_ELEMENT,
      chartPoints: 1201,
    })
  })
})

describe('Check display request latest-wins boundary', () => {
  it('keeps display and range policy snapshots isolated and commits only latest', async () => {
    let resolveFirst
    const first = new Promise((resolve) => { resolveFirst = resolve })
    const received = []
    const committed = []
    let callCount = 0
    const runner = createLatestCalculationRunner({
      feedback: createCalculationFeedbackState(),
      snapshotRequest: createCheckCalculationRequestSnapshot,
      calculate: (request) => {
        received.push(request)
        callCount += 1
        return callCount === 1 ? first : Promise.resolve('latest')
      },
      clearResult: () => {},
      commitResult: (result) => committed.push(result),
    })
    const firstRequest = createCheckCalculationRequestSnapshot({
      ...createInput(),
      displayRequest: { min: 0, max: 30, mode: CHECK_DISPLAY_MODES.PMF },
    })
    const queuedDraft = {
      ...createInput(),
      displayRequest: { min: 0, max: 1200, mode: CHECK_DISPLAY_MODES.UPPER_TAIL },
      rangePolicy: { calculationMax: 0 },
    }
    const firstRun = runner.run(firstRequest)
    const secondRun = runner.run(queuedDraft)
    queuedDraft.displayRequest.max = 1
    queuedDraft.rangePolicy.calculationMax = 1
    resolveFirst('stale')

    await expect(firstRun).resolves.toBe(false)
    await expect(secondRun).resolves.toBe(true)
    expect(received[1].displayRequest).toEqual({
      min: 0,
      max: 1200,
      mode: CHECK_DISPLAY_MODES.UPPER_TAIL,
    })
    expect(received[1].rangePolicy.calculationMax).toBe(1200)
    expect(committed).toEqual(['latest'])
  })
})
