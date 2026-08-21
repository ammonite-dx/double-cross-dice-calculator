import { describe, expect, it, vi } from 'vitest'

import { createAttackCanonicalRunner } from '../src/application/AttackCanonicalRunner'
import {
  createAttackCanonicalDisplayPresentation,
  createAttackCanonicalDisplayPresentationFromCanonical,
} from '../src/application/AttackCanonicalPresentation'
import {
  createCanonicalAttackState,
  createCanonicalComboDataState,
} from '../src/application/AttackCanonicalState'
import {
  ATTACK_DISPLAY_MODES,
} from '../src/application/AttackDisplayRequestSnapshot'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import { getCanonicalDamageSummary } from '../src/calculation/DamageCalculator'

function createEnvelope(values, max = values.length - 1) {
  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support: { kind: 'finite', max },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      sourceSupport: { kind: 'infinite' },
    },
  }
}

function createParams() {
  return {
    action: {
      score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      damage: { dice: 0, value: 1, kazanari: 0 },
    },
    reaction: {
      mode: 'ドッジ',
      score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      damage: { dice: 0, value: 0 },
    },
  }
}

function createScore() {
  return {
    action: { distribution: [1, 0], upperTailProbability: [1, 0] },
    reaction: { distribution: [1, 0], upperTailProbability: [1, 0] },
  }
}

function createState() {
  return {
    ...createCanonicalAttackState(),
    canonicalOptIn: true,
    combos: [{
      id: 'combo-1',
      name: 'コンボ1',
      data: {
        params: createParams(),
        ...createCanonicalComboDataState(),
      },
    }],
  }
}

function createBatch(supportMax = 1, values = [0.25, 0.75]) {
  const canonicalDamage = createEnvelope(values, supportMax)
  return {
    combos: [{
      id: 'combo-1',
      score: createScore(),
      scoreSummary: { action: { expectedValue: 1 } },
      canonicalDamage,
      canonicalDamageSummary: getCanonicalDamageSummary(canonicalDamage),
    }],
    canonicalTotalDamage: canonicalDamage,
    canonicalTotalDamageSummary: getCanonicalDamageSummary(canonicalDamage),
  }
}

function createCanonicalScoreBatch() {
  const damage = createEnvelope([1], 0)
  const total = createEnvelope([1], 0)
  const score = {
    action: createEnvelope([0.25, 0.75], 1),
    reaction: createEnvelope([0.5, 0.5], 1),
  }
  const scoreSummary = {
    action: {
      expectedValue: { kind: 'exact', value: 0.75 },
      successRate: { kind: 'exact', value: 0 },
    },
    reaction: {
      expectedValue: { kind: 'exact', value: 0.5 },
      successRate: { kind: 'exact', value: 100 },
    },
  }
  return {
    combos: [{
      id: 'combo-1',
      score,
      scoreSummary,
      canonicalDamage: damage,
      canonicalDamageSummary: getCanonicalDamageSummary(damage),
    }],
    canonicalTotalDamage: total,
    canonicalTotalDamageSummary: getCanonicalDamageSummary(total),
  }
}

function createCanonicalSource(state) {
  return {
    combos: state.combos.map((combo) => ({
      id: combo.id,
      canonicalDamagePresentation:
        combo.data.canonicalDamagePresentation,
    })),
    canonicalTotalDamagePresentation: state.canonicalTotalDamagePresentation,
  }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('Attack canonical display integration', () => {
  it('reuses the committed canonical presentation when only the display changes', async () => {
    const state = createState()
    const displayRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const batch = createBatch(4)
    const plans = [{ operation: 'attack', warnings: [] }]
    const createPresentation = vi.fn((batchResult, rangePlans) =>
      createAttackCanonicalDisplayPresentation(batchResult, {
        displayRequest,
        rangePlans,
      })
    )
    const createDisplayPresentation = vi.fn(({ state: currentState }) =>
      createAttackCanonicalDisplayPresentationFromCanonical(
        createCanonicalSource(currentState),
        { displayRequest }
      )
    )
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan(plans[0])
        return batch
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation,
      createDisplayPresentation,
    })

    await expect(runner.run()).resolves.toBe(true)
    expect(state.canonicalDisplayPresentation.status).toBe('ready')

    displayRequest.max = 0
    expect(runner.refreshPresentation()).toBe(true)

    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledOnce()
    expect(createPresentation).toHaveBeenCalledOnce()
    expect(createDisplayPresentation).toHaveBeenCalledOnce()
    expect(state.canonicalDisplayPresentation.displayRequest).toEqual({
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    expect(state.canonicalDisplayPresentation.combos[0].series.values)
      .toHaveLength(1)

    state.combos[0].data.params.action.score.dice = 2
    expect(runner.refreshPresentation()).toBe(false)
    expect(state.canonicalDisplayPresentation.displayRequest.max).toBe(0)

    runner.dispose()
    expect(runner.refreshPresentation()).toBe(false)
  })

  it('recalculates once when coverage is insufficient inside finite support', async () => {
    const state = createState()
    const displayRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createBatch(4)
    const extendedBatch = createBatch(4, [0.25, 0.5, 0.25])
    const initialPlan = { id: 'initial-plan', operation: 'attack', warnings: [] }
    const extendedPlan = { id: 'extended-plan', operation: 'attack', warnings: [] }
    const rangePolicy = {
      calculationMax: 1200,
      display: { defaultMin: 0, defaultMax: 2, maxPoints: 3 },
    }
    const requestMetadata = { label: 'attack-display-recalculate' }
    let calculationCount = 0
    const createPresentation = vi.fn((batchResult, rangePlans, request) =>
      createAttackCanonicalDisplayPresentation(batchResult, {
        displayRequest: request ?? displayRequest,
        rangePlans,
      })
    )
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        options.onRangePlan(
          calculationCount === 1 ? initialPlan : extendedPlan
        )
        return calculationCount === 1 ? initialBatch : extendedBatch
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation,
      createDisplayPresentation: ({
        state: currentState,
        displayRequest: requestedDisplayRequest,
      }) =>
        createAttackCanonicalDisplayPresentationFromCanonical(
          createCanonicalSource(currentState),
          {
            displayRequest: requestedDisplayRequest ?? displayRequest,
          }
        ),
    })

    await expect(runner.run({ displayRequest })).resolves.toBe(true)
    await expect(runner.refreshPresentation({
      displayRequest: { ...displayRequest, max: 2 },
      calculationOptions: {
        rangePolicy,
        requestMetadata,
      },
    })).resolves.toBe(true)

    expect(calculationCount).toBe(2)
    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(2)
    const [, recalculationOptions] =
      calculationClient.calculateAttackCanonicalBatch.mock.calls[1]
    expect(recalculationOptions.rangePolicy).toEqual(rangePolicy)
    expect(recalculationOptions.requestMetadata).toEqual(requestMetadata)
    expect(recalculationOptions.signal).toBeInstanceOf(AbortSignal)
    expect(recalculationOptions.onRangePlan).toBeTypeOf('function')
    expect(createPresentation.mock.calls[0][1]).toEqual([initialPlan])
    expect(createPresentation.mock.calls[1][1]).toEqual([extendedPlan])
    expect(state.canonicalDisplayPresentation.decision).toBe('reuse')
    expect(state.canonicalDisplayPresentation.total.chart).not.toBeNull()
    expect(state.canonicalDisplayPresentation.displayRequest.max).toBe(2)
  })

  it('suppresses a recalculation result after its external signal aborts', async () => {
    const state = createState()
    const initialRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createBatch(4)
    const extendedBatch = createBatch(4, [0.25, 0.5, 0.25])
    const deferredRecalculation = createDeferred()
    const externalController = new AbortController()
    const createPresentation = vi.fn((batchResult, rangePlans, request) =>
      createAttackCanonicalDisplayPresentation(batchResult, {
        displayRequest: request ?? initialRequest,
        rangePlans,
      })
    )
    let calculationCount = 0
    let recalculationOptions
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        options.onRangePlan({
          id: `plan-${calculationCount}`,
          operation: 'attack',
          warnings: [],
        })
        if (calculationCount === 1) {
          return initialBatch
        }
        recalculationOptions = options
        return deferredRecalculation.promise
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation,
      createDisplayPresentation: ({ state: currentState, displayRequest }) =>
        createAttackCanonicalDisplayPresentationFromCanonical(
          createCanonicalSource(currentState),
          { displayRequest: displayRequest ?? initialRequest }
        ),
    })

    await expect(runner.run({ displayRequest: initialRequest }))
      .resolves.toBe(true)
    const recalculation = runner.refreshPresentation({
      displayRequest: { ...initialRequest, max: 2 },
      calculationOptions: {
        signal: externalController.signal,
        rangePolicy: { calculationMax: 1200 },
        requestMetadata: { label: 'external-abort' },
      },
    })

    expect(recalculationOptions).toBeDefined()
    expect(recalculationOptions.signal).toBeInstanceOf(AbortSignal)
    expect(recalculationOptions.signal.aborted).toBe(false)
    externalController.abort()
    deferredRecalculation.resolve(extendedBatch)

    await expect(recalculation).resolves.toBe(false)
    expect(recalculationOptions.signal.aborted).toBe(true)
    expect(createPresentation).toHaveBeenCalledOnce()
    expect(state.canonicalDisplayPresentation).toBeNull()
    expect(state.canonicalTotalDamageReady).toBe(false)
  })

  it('rejects a display resource plan without calling the calculation client', async () => {
    const state = createState()
    const displayRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const batch = createBatch(4)
    const onDisplayRejected = vi.fn()
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan({ operation: 'attack', warnings: [] })
        return batch
      }),
    }
    const createDisplayPresentation = ({ state: currentState }) =>
      createAttackCanonicalDisplayPresentationFromCanonical(
        createCanonicalSource(currentState),
        {
          displayRequest,
          policy: {
            warning: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
            hard: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
          },
        }
      )
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans) =>
        createAttackCanonicalDisplayPresentation(batchResult, {
          displayRequest,
          rangePlans,
          policy: {
            warning: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
            hard: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
          },
        }),
      createDisplayPresentation,
      onDisplayRejected,
    })

    await expect(runner.run()).resolves.toBe(true)
    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledOnce()

    displayRequest.max = 2
    expect(runner.refreshPresentation()).toBe(false)

    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledOnce()
    expect(onDisplayRejected).toHaveBeenCalledOnce()
    expect(state.canonicalDisplayPresentation).toBeNull()
    expect(state.canonicalTotalDamageReady).toBe(false)
  })

  it('keeps rapid display changes latest-wins', async () => {
    const state = createState()
    const initialRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const oldExpansion = createBatch(4, [0.25, 0.5, 0.25])
    const latestExpansion = createBatch(4, [0.1, 0.2, 0.3, 0.4])
    const deferredExpansion = createDeferred()
    const signals = []
    let callCount = 0
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        callCount += 1
        signals.push(options.signal)
        options.onRangePlan({ operation: 'attack', warnings: [] })
        if (callCount === 1) {
          return createBatch(4)
        }
        if (callCount === 2) {
          return deferredExpansion.promise
        }
        return latestExpansion
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request) =>
        createAttackCanonicalDisplayPresentation(batchResult, {
          displayRequest: request ?? initialRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({ state: currentState, displayRequest }) =>
        createAttackCanonicalDisplayPresentationFromCanonical(
          createCanonicalSource(currentState),
          { displayRequest: displayRequest ?? initialRequest }
        ),
    })

    await expect(runner.run({ displayRequest: initialRequest }))
      .resolves.toBe(true)
    const firstExpansion = runner.refreshPresentation({
      displayRequest: { ...initialRequest, max: 2 },
    })
    const latest = runner.run({
      displayRequest: { ...initialRequest, max: 3 },
    })
    deferredExpansion.resolve(oldExpansion)

    await expect(firstExpansion).resolves.toBe(false)
    await expect(latest).resolves.toBe(true)
    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(3)
    expect(signals[1].aborted).toBe(true)
    expect(state.canonicalDisplayPresentation.displayRequest.max).toBe(3)
    expect(Array.from(state.canonicalDisplayPresentation.combos[0].series.values))
      .toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it.each(['invalid', 'resource', 'error'])(
    'keeps an in-flight Damage batch commit after Score-only %s',
    async (failureKind) => {
      const state = createState()
      const displayRequest = {
        min: 0,
        max: 0,
        mode: ATTACK_DISPLAY_MODES.PMF,
      }
      const scoreDisplayRequest = {
        min: 0,
        max: 1,
        mode: ATTACK_DISPLAY_MODES.PMF,
      }
      const initialBatch = createCanonicalScoreBatch()
      const deferredBatch = createDeferred()
      let calculationCount = 0
      const presentations = []
      const calculationClient = {
        calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
          calculationCount += 1
          options.onRangePlan({
            id: `plan-${calculationCount}`,
            operation: 'attack',
            warnings: [],
          })
          return calculationCount === 1
            ? initialBatch
            : deferredBatch.promise
        }),
      }
      const createPresentation = (batchResult, rangePlans, request, scoreRequest) =>
        createAttackCanonicalDisplayPresentation(batchResult, {
          displayRequest: request ?? displayRequest,
          scoreDisplayRequest: scoreRequest ?? scoreDisplayRequest,
          rangePlans,
        })
      const runner = createAttackCanonicalRunner({
        state,
        calculationClient,
        createPresentation,
        onPresentation: (presentation, metadata) => {
          presentations.push({ presentation, metadata })
        },
      })

      await expect(runner.run({
        displayRequest,
        scoreDisplayRequest,
      })).resolves.toBe(true)
      expect(state.canonicalScoreDisplayPresentation).not.toBeNull()

      const deferredCalculation = runner.run({
        displayRequest,
        scoreDisplayRequest,
      })
      state.canonicalScoreDisplayFeedback.status = failureKind === 'error'
        ? 'error'
        : 'rejected'
      runner.invalidateScoreDisplay()
      deferredBatch.resolve(createCanonicalScoreBatch())

      await expect(deferredCalculation).resolves.toBe(true)
      expect(state.canonicalTotalDamageReady).toBe(true)
      expect(state.canonicalDisplayPresentation).not.toBeNull()
      expect(state.canonicalDisplayPresentation.total).toBeDefined()
      expect(state.canonicalDisplayPresentation.score).toBeNull()
      expect(state.canonicalScoreDisplayPresentation).toBeNull()
      expect(presentations.at(-1).metadata.scoreDisplaySuppressed).toBe(true)
      expect(state.canonicalScoreDisplayFeedback.status).toBe(
        failureKind === 'error' ? 'error' : 'rejected'
      )
    }
  )
})
