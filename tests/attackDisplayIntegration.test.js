import { describe, expect, it, vi } from 'vitest'

import { createAttackRunner } from '../src/features/attack/model/AttackRunner'
import {
  createAttackDisplayPresentation,
  createAttackDisplayPresentationFrom,
} from '../src/features/attack/model/AttackPresentation'
import {
  createAttackState,
  createComboDataState,
} from '../src/features/attack/model/AttackState'
import {
  ATTACK_DISPLAY_MODES,
} from '../src/features/attack/model/AttackDisplayRequestSnapshot'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import { getDamageSummary } from '../src/calculation/DamageCalculator'

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

function createInfiniteEnvelope(values) {
  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support: { kind: 'infinite' },
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
    ...createAttackState(),
    combos: [{
      id: 'combo-1',
      name: 'コンボ1',
      data: {
        params: createParams(),
        ...createComboDataState(),
      },
    }],
  }
}

function createBatch(supportMax = 1, values = [0.25, 0.75]) {
  const damage = createEnvelope(values, supportMax)
  return {
    combos: [{
      id: 'combo-1',
      score: createScore(),
      scoreSummary: { action: { expectedValue: 1 } },
      damage,
      damageSummary: getDamageSummary(damage),
    }],
    totalDamage: damage,
    totalDamageSummary: getDamageSummary(damage),
  }
}

function createScoreBatch() {
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
      damage: damage,
      damageSummary: getDamageSummary(damage),
    }],
    totalDamage: total,
    totalDamageSummary: getDamageSummary(total),
  }
}

function createScoreBatchWithInfiniteScoreSupport() {
  const batch = createScoreBatch()
  batch.combos[0].score = {
    action: createInfiniteEnvelope([0.25, 0.75]),
    reaction: createInfiniteEnvelope([0.5, 0.5]),
  }
  return batch
}

function createScoreExpansion(actionValues, reactionValues = actionValues) {
  const damage = createEnvelope([1], 0)
  const score = {
    action: createInfiniteEnvelope(actionValues),
    reaction: createInfiniteEnvelope(reactionValues),
  }
  const scoreSummary = {
    action: {
      expectedValue: { kind: 'exact', value: 1 },
      successRate: { kind: 'exact', value: 50 },
    },
    reaction: {
      expectedValue: { kind: 'exact', value: 1 },
      successRate: { kind: 'exact', value: 50 },
    },
  }
  return {
    combos: [{
      id: 'combo-1',
      score,
      scoreSummary,
      damage: damage,
      damageSummary: getDamageSummary(damage),
    }],
    totalDamage: damage,
    totalDamageSummary: getDamageSummary(damage),
  }
}

function createSource(state) {
  return {
    combos: state.combos.map((combo) => ({
      id: combo.id,
      score: combo.data.score,
      scoreSummary: combo.data.scoreSummary,
      scoreBatchSummary: combo.data.scoreBatchSummary,
      scorePresentation: combo.data.scorePresentation,
      damagePresentation:
        combo.data.damagePresentation,
      rangePlan: combo.data.rangePlan,
    })),
    totalDamagePresentation: state.totalDamagePresentation,
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
      createAttackDisplayPresentation(batchResult, {
        displayRequest,
        rangePlans,
      })
    )
    const createDisplayPresentation = vi.fn(({ state: currentState }) =>
      createAttackDisplayPresentationFrom(
        createSource(currentState),
        { displayRequest }
      )
    )
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan(plans[0])
        return batch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation,
      createDisplayPresentation,
    })

    await expect(runner.run()).resolves.toBe(true)
    expect(state.displayPresentation.status).toBe('ready')

    displayRequest.max = 0
    expect(runner.refreshPresentation()).toBe(true)

    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledOnce()
    expect(createPresentation).toHaveBeenCalledOnce()
    expect(createDisplayPresentation).toHaveBeenCalledOnce()
    expect(state.displayPresentation.displayRequest).toEqual({
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    expect(state.displayPresentation.combos[0].series.values)
      .toHaveLength(1)

    state.combos[0].data.params.action.score.dice = 2
    expect(runner.refreshPresentation()).toBe(false)
    expect(state.displayPresentation.displayRequest.max).toBe(0)

    runner.dispose()
    expect(runner.refreshPresentation()).toBe(false)
  })

  it('reuses score coverage and finite-support known-zero without a client call', async () => {
    const state = createState()
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const batch = createScoreBatch()
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan({ operation: 'attack', warnings: [] })
        return batch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })).resolves.toBe(true)

    expect(runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
      scoreOnly: true,
    })).toBe(true)
    expect(state.scoreDisplayPresentation.status).toBe('ready')
    expect(calculationClient.calculateAttackBatch)
      .toHaveBeenCalledOnce()

    expect(runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: {
        min: 2,
        max: 3,
        mode: ATTACK_DISPLAY_MODES.PMF,
      },
      scoreOnly: true,
    })).toBe(true)
    expect(state.scoreDisplayPresentation.status).toBe('ready')
    expect(Array.from(
      state.scoreDisplayPresentation.combos[0].action.series.values
    )).toEqual([0, 0])
    expect(calculationClient.calculateAttackBatch)
      .toHaveBeenCalledOnce()
  })

  it('recalculates the canonical batch once when score coverage is missing', async () => {
    const state = createState()
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const expandedScoreRequest = {
      min: 0,
      max: 2,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createScoreBatchWithInfiniteScoreSupport()
    const expandedBatch = createScoreExpansion(
      [0.2, 0.3, 0.5],
      [0.5, 0.3, 0.2]
    )
    let calculationCount = 0
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        options.onRangePlan({
          id: `plan-${calculationCount}`,
          operation: 'attack',
          warnings: [],
        })
        return calculationCount === 1 ? initialBatch : expandedBatch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })).resolves.toBe(true)

    const recalculation = runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: expandedScoreRequest,
      scoreOnly: true,
      calculationOptions: {
        rangePolicy: { calculationMax: 1200 },
      },
    })

    await expect(recalculation).resolves.toBe(true)
    expect(calculationCount).toBe(2)
    expect(calculationClient.calculateAttackBatch)
      .toHaveBeenCalledTimes(2)
    const [, options] = calculationClient.calculateAttackBatch
      .mock.calls[1]
    expect(options.rangePolicy).toEqual({ calculationMax: 1200 })
    expect(state.scoreDisplayPresentation.status).toBe('ready')
    expect(state.scoreDisplayPresentation.displayRequest)
      .toEqual(expandedScoreRequest)
    expect(state.displayPresentation.displayRequest)
      .toEqual(damageRequest)
    expect(state.totalDamage).toBe(expandedBatch.totalDamage)
  })

  it('clears only public score while a deferred score expansion is running', async () => {
    const state = createState()
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const expandedScoreRequest = {
      min: 0,
      max: 2,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createScoreBatchWithInfiniteScoreSupport()
    const expandedBatch = createScoreExpansion(
      [0.2, 0.3, 0.5]
    )
    const deferredExpansion = createDeferred()
    let calculationCount = 0
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        options.onRangePlan({
          id: `plan-${calculationCount}`,
          operation: 'attack',
          warnings: [],
        })
        return calculationCount === 1
          ? initialBatch
          : deferredExpansion.promise
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })).resolves.toBe(true)
    const previousDamagePresentation = state.displayPresentation
    const previousDamageCombos = previousDamagePresentation.combos
    const previousDamageTotal = previousDamagePresentation.total

    const recalculation = runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: expandedScoreRequest,
      scoreOnly: true,
    })

    expect(state.displayPresentation.score).toBeNull()
    expect(state.scoreDisplayPresentation).toBeNull()
    expect(state.scoreDisplayFeedback.status).toBe('loading')
    expect(state.displayPresentation.combos)
      .toBe(previousDamageCombos)
    expect(state.displayPresentation.total)
      .toBe(previousDamageTotal)
    expect(state.totalDamageReady).toBe(true)
    expect(state.combos[0].data.score).not.toBeNull()

    deferredExpansion.resolve(expandedBatch)
    await expect(recalculation).resolves.toBe(true)

    expect(state.scoreDisplayPresentation.status).toBe('ready')
    expect(state.scoreDisplayPresentation.displayRequest)
      .toEqual(expandedScoreRequest)
    expect(state.scoreDisplayPresentation.combos[0]
      .action.series.values)
      .toEqual(new Float64Array([0.2, 0.3, 0.5]))
    expect(calculationCount).toBe(2)
  })

  it.each(['abort', 'error'])(
    'does not restore the old public score after a deferred expansion %s',
    async (failureKind) => {
      const state = createState()
      const damageRequest = {
        min: 0,
        max: 0,
        mode: ATTACK_DISPLAY_MODES.PMF,
      }
      const initialScoreRequest = {
        min: 0,
        max: 0,
        mode: ATTACK_DISPLAY_MODES.PMF,
      }
      const expandedScoreRequest = {
        min: 0,
        max: 2,
        mode: ATTACK_DISPLAY_MODES.PMF,
      }
      const initialBatch = createScoreBatchWithInfiniteScoreSupport()
      const deferredExpansion = createDeferred()
      const externalController = new AbortController()
      let calculationCount = 0
      const calculationClient = {
        calculateAttackBatch: vi.fn(async (_entries, options) => {
          calculationCount += 1
          options.onRangePlan({
            id: `plan-${calculationCount}`,
            operation: 'attack',
            warnings: [],
          })
          if (calculationCount === 1) {
            return initialBatch
          }
          if (failureKind === 'abort') {
            return deferredExpansion.promise
          }
          throw new Error('score expansion failed')
        }),
      }
      const runner = createAttackRunner({
        state,
        calculationClient,
        createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
          createAttackDisplayPresentation(batchResult, {
            displayRequest: request ?? damageRequest,
            scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
            rangePlans,
          }),
        createDisplayPresentation: ({
          state: currentState,
          displayRequest,
          scoreDisplayRequest,
        }) => createAttackDisplayPresentationFrom(
          createSource(currentState),
          {
            displayRequest: displayRequest ?? damageRequest,
            scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
          }
        ),
      })

      await expect(runner.run({
        displayRequest: damageRequest,
        scoreDisplayRequest: initialScoreRequest,
      })).resolves.toBe(true)
      const recalculation = runner.refreshPresentation({
        displayRequest: damageRequest,
        scoreDisplayRequest: expandedScoreRequest,
        scoreOnly: true,
        calculationOptions: {
          signal: externalController.signal,
        },
      })

      expect(state.scoreDisplayPresentation).toBeNull()
      expect(state.scoreDisplayFeedback.status).toBe('loading')
      if (failureKind === 'abort') {
        externalController.abort()
        deferredExpansion.resolve(createScoreExpansion(
          [0.2, 0.3, 0.5]
        ))
      }

      await expect(recalculation).resolves.toBe(false)
      expect(state.scoreDisplayPresentation).toBeNull()
      expect(state.displayPresentation?.score ?? null).toBeNull()
      expect(state.scoreDisplayFeedback.status)
        .not.toBe('loading')
    }
  )

  it('rejects a score display resource plan without clearing damage or calling the client', async () => {
    const state = createState()
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const rejectedScoreRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const batch = createScoreBatch()
    const displayPolicy = {
      warning: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
      hard: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
    }
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan({ operation: 'attack', warnings: [] })
        return batch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
          policy: displayPolicy,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
          policy: displayPolicy,
        }
      ),
    })

    const initialResult = await runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })
    expect(initialResult).toBe(true)
    const previousDamage = state.displayPresentation.combos[0]
      .display

    expect(runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: rejectedScoreRequest,
      scoreOnly: true,
    })).toBe(false)

    expect(calculationClient.calculateAttackBatch)
      .toHaveBeenCalledOnce()
    expect(state.displayPresentation.combos[0].display)
      .toBe(previousDamage)
    expect(state.scoreDisplayPresentation).toBeNull()
    expect(state.totalDamageReady).toBe(true)
  })

  it('continues the damage refresh when score is resource-rejected', async () => {
    const state = createState()
    const initialDamageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const expandedDamageRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const rejectedScoreRequest = {
      min: 0,
      max: 2,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createScoreBatch()
    const initialDamage = createInfiniteEnvelope([1])
    initialBatch.combos[0].damage = initialDamage
    initialBatch.combos[0].damageSummary =
      getDamageSummary(initialDamage)
    initialBatch.totalDamage = initialDamage
    initialBatch.totalDamageSummary =
      getDamageSummary(initialDamage)
    const expandedBatch = createScoreBatch()
    const expandedDamage = createEnvelope([0.5, 0.5], 1)
    expandedBatch.combos[0].damage = expandedDamage
    expandedBatch.combos[0].damageSummary =
      getDamageSummary(expandedDamage)
    expandedBatch.totalDamage = expandedDamage
    expandedBatch.totalDamageSummary =
      getDamageSummary(expandedDamage)
    const displayPolicy = {
      warning: { pointCount: 2, float64Bytes: 16, chartPoints: 2 },
      hard: { pointCount: 2, float64Bytes: 16, chartPoints: 2 },
    }
    let calculationCount = 0
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        options.onRangePlan({
          id: `plan-${calculationCount}`,
          operation: 'attack',
          warnings: [],
        })
        return calculationCount === 1 ? initialBatch : expandedBatch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? initialDamageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
          policy: displayPolicy,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? initialDamageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
          policy: displayPolicy,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: initialDamageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })).resolves.toBe(true)

    expect(runner.refreshPresentation({
      displayRequest: initialDamageRequest,
      scoreDisplayRequest: rejectedScoreRequest,
    })).toBe(true)
    expect(calculationCount).toBe(1)
    expect(state.displayPresentation.displayRequest)
      .toEqual(initialDamageRequest)
    expect(state.displayPresentation.score).toBeNull()

    await expect(runner.refreshPresentation({
      displayRequest: expandedDamageRequest,
      scoreDisplayRequest: rejectedScoreRequest,
      calculationOptions: {
        rangePolicy: { calculationMax: 1 },
      },
    })).resolves.toBe(true)

    expect(calculationCount).toBe(2)
    const [, options] = calculationClient.calculateAttackBatch
      .mock.calls[1]
    expect(options.rangePolicy).toEqual({ calculationMax: 1 })
    expect(state.displayPresentation.displayRequest)
      .toEqual(expandedDamageRequest)
    expect(state.displayPresentation.score).toBeNull()
    expect(state.totalDamage).toBe(expandedDamage)
  })

  it('keeps rapid score expansions latest-wins', async () => {
    const state = createState()
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const firstScoreRequest = {
      min: 0,
      max: 2,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const latestScoreRequest = {
      min: 0,
      max: 3,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createScoreBatchWithInfiniteScoreSupport()
    const oldExpansion = createScoreExpansion(
      [0.2, 0.3, 0.3, 0.2]
    )
    const latestExpansion = createScoreExpansion(
      [0.1, 0.2, 0.3, 0.4]
    )
    const deferredExpansion = createDeferred()
    const signals = []
    let calculationCount = 0
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        signals.push(options.signal)
        options.onRangePlan({
          id: `plan-${calculationCount}`,
          operation: 'attack',
          warnings: [],
        })
        if (calculationCount === 1) {
          return initialBatch
        }
        if (calculationCount === 2) {
          return deferredExpansion.promise
        }
        return latestExpansion
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })).resolves.toBe(true)

    const first = runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: firstScoreRequest,
      scoreOnly: true,
    })
    const latest = runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: latestScoreRequest,
      scoreOnly: true,
    })
    deferredExpansion.resolve(oldExpansion)

    await expect(first).resolves.toBe(false)
    await expect(latest).resolves.toBe(true)
    expect(calculationCount).toBe(3)
    expect(signals[1].aborted).toBe(true)
    expect(state.scoreDisplayPresentation.displayRequest)
      .toEqual(latestScoreRequest)
    expect(Array.from(
      state.scoreDisplayPresentation.combos[0].action.series.values
    )).toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it('blocks stale score batches after input changes and opt-in invalidation', async () => {
    const state = createState()
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const expandedScoreRequest = {
      min: 0,
      max: 2,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialBatch = createScoreBatchWithInfiniteScoreSupport()
    const oldExpansion = createScoreExpansion(
      [0.2, 0.3, 0.5]
    )
    const latestBatch = createScoreExpansion(
      [0.1, 0.2, 0.3, 0.4]
    )
    const deferredExpansion = createDeferred()
    const deferredInvalidatedExpansion = createDeferred()
    const signals = []
    let calculationCount = 0
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        signals.push(options.signal)
        options.onRangePlan({
          id: `plan-${calculationCount}`,
          operation: 'attack',
          warnings: [],
        })
        if (calculationCount === 1) {
          return initialBatch
        }
        if (calculationCount === 2) {
          return deferredExpansion.promise
        }
        if (calculationCount === 3) {
          return latestBatch
        }
        return deferredInvalidatedExpansion.promise
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
    })).resolves.toBe(true)

    const scoreRecalculation = runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: expandedScoreRequest,
      scoreOnly: true,
    })
    state.combos[0].data.params.action.score.dice = 2
    const latestCalculation = runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: expandedScoreRequest,
      rangePolicy: { calculationMax: 3 },
    })
    deferredExpansion.resolve(oldExpansion)

    await expect(scoreRecalculation).resolves.toBe(false)
    await expect(latestCalculation).resolves.toBe(true)
    expect(signals[1].aborted).toBe(true)
    expect(state.scoreDisplayPresentation.displayRequest)
      .toEqual(expandedScoreRequest)
    expect(state.combos[0].data.params.action.score.dice).toBe(2)

    const invalidatedRecalculation = runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: {
        min: 0,
        max: 4,
        mode: ATTACK_DISPLAY_MODES.PMF,
      },
      scoreOnly: true,
    })
    runner.invalidate()
    deferredInvalidatedExpansion.resolve(
      createScoreExpansion([0.1, 0.2, 0.3, 0.2, 0.2])
    )

    await expect(invalidatedRecalculation).resolves.toBe(false)
    expect(signals[3].aborted).toBe(true)
    expect(state.scoreDisplayPresentation).toBeNull()
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
      createAttackDisplayPresentation(batchResult, {
        displayRequest: request ?? displayRequest,
        rangePlans,
      })
    )
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        calculationCount += 1
        options.onRangePlan(
          calculationCount === 1 ? initialPlan : extendedPlan
        )
        return calculationCount === 1 ? initialBatch : extendedBatch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation,
      createDisplayPresentation: ({
        state: currentState,
        displayRequest: requestedDisplayRequest,
      }) =>
        createAttackDisplayPresentationFrom(
          createSource(currentState),
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
    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledTimes(2)
    const [, recalculationOptions] =
      calculationClient.calculateAttackBatch.mock.calls[1]
    expect(recalculationOptions.rangePolicy).toEqual(rangePolicy)
    expect(recalculationOptions.requestMetadata).toEqual(requestMetadata)
    expect(recalculationOptions.signal).toBeInstanceOf(AbortSignal)
    expect(recalculationOptions.onRangePlan).toBeTypeOf('function')
    expect(createPresentation.mock.calls[0][1]).toEqual([initialPlan])
    expect(createPresentation.mock.calls[1][1]).toEqual([extendedPlan])
    expect(state.displayPresentation.decision).toBe('reuse')
    expect(state.displayPresentation.total.chart).not.toBeNull()
    expect(state.displayPresentation.displayRequest.max).toBe(2)
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
      createAttackDisplayPresentation(batchResult, {
        displayRequest: request ?? initialRequest,
        rangePlans,
      })
    )
    let calculationCount = 0
    let recalculationOptions
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
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
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation,
      createDisplayPresentation: ({ state: currentState, displayRequest }) =>
        createAttackDisplayPresentationFrom(
          createSource(currentState),
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
    expect(state.displayPresentation).toBeNull()
    expect(state.totalDamageReady).toBe(false)
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
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan({ operation: 'attack', warnings: [] })
        return batch
      }),
    }
    const createDisplayPresentation = ({ state: currentState }) =>
      createAttackDisplayPresentationFrom(
        createSource(currentState),
        {
          displayRequest,
          policy: {
            warning: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
            hard: { pointCount: 1, float64Bytes: 8, chartPoints: 1 },
          },
        }
      )
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans) =>
        createAttackDisplayPresentation(batchResult, {
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
    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledOnce()

    displayRequest.max = 2
    expect(runner.refreshPresentation()).toBe(false)

    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledOnce()
    expect(onDisplayRejected).toHaveBeenCalledOnce()
    expect(state.displayPresentation).toBeNull()
    expect(state.totalDamageReady).toBe(false)
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
      calculateAttackBatch: vi.fn(async (_entries, options) => {
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
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: (batchResult, rangePlans, request) =>
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? initialRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({ state: currentState, displayRequest }) =>
        createAttackDisplayPresentationFrom(
          createSource(currentState),
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
    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledTimes(3)
    expect(signals[1].aborted).toBe(true)
    expect(state.displayPresentation.displayRequest.max).toBe(3)
    expect(Array.from(state.displayPresentation.combos[0].series.values))
      .toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it.each(['invalid', 'resource', 'error'])(
    'keeps an in-flight damage batch commit after score-only %s',
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
      const initialBatch = createScoreBatch()
      const deferredBatch = createDeferred()
      let calculationCount = 0
      const presentations = []
      const calculationClient = {
        calculateAttackBatch: vi.fn(async (_entries, options) => {
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
        createAttackDisplayPresentation(batchResult, {
          displayRequest: request ?? displayRequest,
          scoreDisplayRequest: scoreRequest ?? scoreDisplayRequest,
          rangePlans,
        })
      const runner = createAttackRunner({
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
      expect(state.scoreDisplayPresentation).not.toBeNull()

      const deferredCalculation = runner.run({
        displayRequest,
        scoreDisplayRequest,
      })
      state.scoreDisplayFeedback.status = failureKind === 'error'
        ? 'error'
        : 'rejected'
      runner.invalidateScoreDisplay()
      deferredBatch.resolve(createScoreBatch())

      await expect(deferredCalculation).resolves.toBe(true)
      expect(state.totalDamageReady).toBe(true)
      expect(state.displayPresentation).not.toBeNull()
      expect(state.displayPresentation.total).toBeDefined()
      expect(state.displayPresentation.score).toBeNull()
      expect(state.scoreDisplayPresentation).toBeNull()
      expect(presentations.at(-1).metadata.scoreDisplaySuppressed).toBe(true)
      expect(state.scoreDisplayFeedback.status).toBe(
        failureKind === 'error' ? 'error' : 'rejected'
      )
    }
  )
})
