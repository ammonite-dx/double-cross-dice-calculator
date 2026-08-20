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

function createBatch(supportMax = 1) {
  const canonicalDamage = createEnvelope([0.25, 0.75], supportMax)
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

  it('keeps recalculate and resource-rejected display states out of the client lane', async () => {
    const state = createState()
    const displayRequest = {
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const batch = createBatch(4)
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient: {
        calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
          options.onRangePlan({ operation: 'attack', warnings: [] })
          return batch
        }),
      },
      createPresentation: (batchResult, rangePlans) =>
        createAttackCanonicalDisplayPresentation(batchResult, {
          displayRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({ state: currentState }) =>
        createAttackCanonicalDisplayPresentationFromCanonical(
          createCanonicalSource(currentState),
          {
            displayRequest,
          }
        ),
    })

    await expect(runner.run()).resolves.toBe(true)
    displayRequest.max = 2
    expect(runner.refreshPresentation()).toBe(true)
    expect(state.canonicalDisplayPresentation.decision).toBe('recalculate')
    expect(state.canonicalDisplayPresentation.total.chart).toBeNull()
    expect(state.canonicalTotalDamageReady).toBe(true)
  })
})
