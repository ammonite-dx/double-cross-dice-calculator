import { describe, expect, it, vi } from 'vitest'

import { ATTACK_DISPLAY_MODES } from '../src/application/AttackDisplayRequestSnapshot'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { getCanonicalDamageSummary } from '../src/calculation/DamageCalculator'
import { useAttack } from '../src/features/attack/model/useAttack'

function createPendingClient() {
  return {
    calculateAttackCanonicalBatch: vi.fn(() => new Promise(() => {})),
  }
}

function createActionSnapshot(dice = 2) {
  return {
    score: {
      dice,
      critical: 10,
      skill: 1,
      yousei: 0,
      shihai: 0,
    },
    damage: {
      dice: 1,
      value: 3,
      kazanari: 0,
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

function createAttackBatch({ width = 101, marker = 0, damageMarker = marker } = {}) {
  const values = Array.from({ length: width }, (_, index) =>
    index === marker ? 1 : 0
  )
  const damageValues = Array.from({ length: width }, (_, index) =>
    index === damageMarker ? 1 : 0
  )
  const score = {
    action: createInfiniteEnvelope(values),
    reaction: createInfiniteEnvelope(values),
  }
  const scoreSummary = {
    action: {
      expectedValue: { kind: 'exact', value: marker },
      successRate: { kind: 'exact', value: 50 },
    },
    reaction: {
      expectedValue: { kind: 'exact', value: marker },
      successRate: { kind: 'exact', value: 50 },
    },
  }
  const damage = createInfiniteEnvelope(damageValues)
  return {
    combos: [{
      id: 0,
      score,
      scoreSummary,
      canonicalDamage: damage,
      canonicalDamageSummary: getCanonicalDamageSummary(damage),
    }],
    canonicalTotalDamage: damage,
    canonicalTotalDamageSummary: getCanonicalDamageSummary(damage),
  }
}

function createResolvedClient(batches = [createAttackBatch()]) {
  let batchIndex = 0
  return {
    calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
      options.onRangePlan?.({
        id: `plan-${batchIndex + 1}`,
        operation: 'attack',
        warnings: [],
      })
      const batch = batches[Math.min(batchIndex, batches.length - 1)]
      batchIndex += 1
      return batch
    }),
  }
}

async function waitForCanonicalReady(controller) {
  await vi.waitFor(() => {
    const presentation = controller.canonicalDisplayPresentation.value
    expect(presentation?.status).toBe('ready')
  })
}

function createController(client = createPendingClient()) {
  return {
    controller: useAttack({ calculationClient: client }),
    client,
  }
}

describe('Attack feature controller', () => {
  it('owns the initial combo and exposes plain UI state', () => {
    const { controller } = createController()
    expect(controller.combos.value).toHaveLength(1)
    expect(controller.combos.value[0]).toMatchObject({
      id: 0,
      name: 'コンボ1',
      show: true,
      showDetails: { action: false, reaction: false },
    })
    expect(controller.combos.value[0]).not.toHaveProperty('data')
    expect(controller.combos.value[0].params.action.score).toEqual({
      dice: 1,
      critical: 10,
      skill: 0,
      yousei: 0,
      shihai: 0,
    })
    controller.dispose()
  })

  it('allocates monotonic ids and calculates once per combo operation', () => {
    const { controller, client } = createController()
    controller.addCombo()
    expect(controller.combos.value.map((combo) => combo.id)).toEqual([0, 1])
    controller.removeCombo(1)
    controller.addCombo()
    expect(controller.combos.value.map((combo) => combo.id)).toEqual([0, 2])
    // The coordinator keeps one active request and coalesces rapid follow-up
    // events into its latest pending request.
    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('duplicates detached input and starts one fresh calculation', () => {
    const { controller, client } = createController()
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(6),
    })
    controller.duplicateCombo(0)
    const source = controller.combos.value[0]
    const duplicate = controller.combos.value[1]
    expect(duplicate).toMatchObject({
      id: 1,
      name: 'コンボ1のコピー',
      show: true,
      showDetails: { action: false, reaction: false },
    })
    expect(duplicate.params.action.score.dice).toBe(6)
    source.params.action.score.dice = 99
    expect(duplicate.params.action.score.dice).toBe(6)
    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('routes validated side snapshots through the controller boundary', () => {
    const { controller, client } = createController()
    const snapshot = createActionSnapshot(4)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot,
    })
    snapshot.score.dice = 99
    expect(controller.combos.value[0].params.action.score.dice).toBe(4)
    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('installs a reaction effective snapshot without changing action input', () => {
    const { controller, client } = createController()
    const snapshot = {
      mode: '《イベイジョン》',
      score: {
        dice: 7,
        critical: 11,
        skill: 4,
        yousei: 0,
        shihai: 0,
      },
      damage: {
        dice: 3,
        value: 12,
      },
    }
    controller.onComboSideValidated({
      id: 0,
      side: 'reaction',
      snapshot,
    })
    snapshot.score.dice = 99
    expect(controller.combos.value[0].params.action.score.dice).toBe(1)
    expect(controller.combos.value[0].params.reaction).toEqual({
      mode: '《イベイジョン》',
      score: {
        dice: 7,
        critical: 11,
        skill: 4,
        yousei: 0,
        shihai: 0,
      },
      damage: {
        dice: 3,
        value: 12,
      },
    })
    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('reuses the committed Damage presentation for a display-only change', async () => {
    const client = createResolvedClient()
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await waitForCanonicalReady(controller)
    const before = controller.canonicalDisplayPresentation.value

    controller.onDisplayValidated({
      min: 0,
      max: 30,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    })

    await vi.waitFor(() => expect(
      controller.canonicalDisplayPresentation.value?.mode
    ).toBe(ATTACK_DISPLAY_MODES.UPPER_TAIL))
    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    expect(controller.canonicalDisplayPresentation.value).not.toBe(before)
    expect(controller.canonicalDisplayPresentation.value?.status).toBe('ready')
    controller.dispose()
  })

  it('recalculates once when the Damage display needs uncovered Score range', async () => {
    const client = createResolvedClient([
      createAttackBatch({ width: 101 }),
      createAttackBatch({ width: 103, marker: 1 }),
    ])
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await waitForCanonicalReady(controller)

    controller.onDisplayValidated({
      min: 0,
      max: 102,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    await vi.waitFor(() => expect(
      client.calculateAttackCanonicalBatch
    ).toHaveBeenCalledTimes(2))
    await waitForCanonicalReady(controller)
    expect(controller.canonicalDisplayPresentation.value.displayRequest)
      .toEqual({ min: 0, max: 102, mode: ATTACK_DISPLAY_MODES.PMF })
    expect(controller.canonicalDisplayPresentation.value.status).toBe('ready')
    controller.dispose()
  })

  it('rejects a Damage display resource plan without starting a calculation', async () => {
    const client = createResolvedClient()
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await waitForCanonicalReady(controller)
    const callsBefore = client.calculateAttackCanonicalBatch.mock.calls.length

    controller.onDisplayValidated({
      min: 0,
      max: 20_000,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(callsBefore)
    expect(controller.canonicalDisplayFeedback.value.status).toBe('rejected')
    expect(controller.canonicalDisplayPresentation.value).toBeNull()
    controller.dispose()
  })

  it('reuses the Score presentation without starting a full batch', async () => {
    const client = createResolvedClient()
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await waitForCanonicalReady(controller)

    controller.onScoreDisplayValidated({
      min: 0,
      max: 30,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    })

    await vi.waitFor(() => expect(
      controller.canonicalScoreDisplayPresentation.value?.status
    ).toBe('ready'))
    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    expect(controller.canonicalDisplayPresentation.value).not.toBeNull()
    expect(controller.canonicalDisplayPresentation.value?.total).not.toBeNull()
    controller.dispose()
  })

  it('recalculates Score display coverage while preserving the Damage lane', async () => {
    const client = createResolvedClient([
      createAttackBatch({ width: 101 }),
      createAttackBatch({ width: 103, marker: 2, damageMarker: 0 }),
    ])
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await waitForCanonicalReady(controller)
    const previousDamage = controller.canonicalDisplayPresentation.value?.total

    controller.onScoreDisplayValidated({
      min: 0,
      max: 102,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    await vi.waitFor(() => expect(
      client.calculateAttackCanonicalBatch
    ).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(
      controller.canonicalScoreDisplayPresentation.value?.status
    ).toBe('ready'))
    expect(controller.canonicalDisplayPresentation.value?.total?.display
      ?.explicit?.probabilities)
      .toEqual([
        ...previousDamage.display.explicit.probabilities,
        0,
        0,
      ])
    expect(controller.canonicalScoreDisplayPresentation.value.displayRequest)
      .toEqual({ min: 0, max: 102, mode: ATTACK_DISPLAY_MODES.PMF })
    controller.dispose()
  })

  it('rejects only Score display resources and keeps committed Damage', async () => {
    const client = createResolvedClient()
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await waitForCanonicalReady(controller)
    const committedDamage = controller.canonicalDisplayPresentation.value

    controller.onScoreDisplayValidated({
      min: 0,
      max: 20_000,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })

    expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledTimes(1)
    expect(controller.canonicalScoreDisplayFeedback.value.status).toBe('rejected')
    expect(controller.canonicalScoreDisplayPresentation.value).toBeNull()
    expect(controller.canonicalDisplayPresentation.value?.total)
      .toBe(committedDamage.total)
    expect(controller.canonicalDisplayPresentation.value?.score).toBeNull()
    controller.dispose()
  })

  it('keeps the latest controller input result when canonical requests overlap', async () => {
    let resolveOld
    let callCount = 0
    const oldBatch = createAttackBatch({ marker: 0 })
    const latestBatch = createAttackBatch({ marker: 1 })
    const client = {
      calculateAttackCanonicalBatch: vi.fn((_entries, options) => {
        callCount += 1
        options.onRangePlan?.({
          id: `plan-${callCount}`,
          operation: 'attack',
          warnings: [],
        })
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolveOld = resolve
          })
        }
        return Promise.resolve(latestBatch)
      }),
    }
    const { controller } = createController(client)

    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(2),
    })
    await vi.waitFor(() => expect(callCount).toBe(1))
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(3),
    })
    resolveOld(oldBatch)
    await vi.waitFor(() => expect(callCount).toBe(2))
    await waitForCanonicalReady(controller)

    expect(controller.combos.value[0].params.action.score.dice).toBe(3)
    expect(controller.canonicalDisplayPresentation.value
      .combos[0].canonicalScore.action.result.values[1]).toBe(1)
    controller.dispose()
  })

  it('does not commit a stale result after controller disposal', async () => {
    let resolvePending
    const client = {
      calculateAttackCanonicalBatch: vi.fn((_entries, options) => {
        options.onRangePlan?.({ operation: 'attack', warnings: [] })
        return new Promise((resolve) => {
          resolvePending = resolve
        })
      }),
    }
    const { controller } = createController(client)
    controller.onComboSideValidated({
      id: 0,
      side: 'action',
      snapshot: createActionSnapshot(),
    })
    await vi.waitFor(() => expect(client.calculateAttackCanonicalBatch).toHaveBeenCalledOnce())
    controller.dispose()
    resolvePending(createAttackBatch())
    await Promise.resolve()
    expect(controller.canonicalDisplayPresentation.value).toBeNull()
  })

  it('does not calculate for labels, visibility, or details-only changes', () => {
    const { controller, client } = createController()
    controller.onComboNameChanged({ id: 0, name: '新しい名前' })
    controller.onComboVisibilityChanged({ id: 0, show: false })
    controller.onComboDetailsChanged({ id: 0, side: 'action', value: true })
    expect(controller.combos.value[0]).toMatchObject({
      name: '新しい名前',
      show: false,
      showDetails: { action: true },
    })
    expect(client.calculateAttackCanonicalBatch).not.toHaveBeenCalled()
    controller.onComboDetailsChanged({
      id: 0,
      side: 'unknown',
      value: false,
    })
    expect(controller.combos.value[0].showDetails).not.toHaveProperty('unknown')
    controller.dispose()
  })

  it('does not start a calculation for an unknown combo or side', () => {
    const { controller, client } = createController()
    controller.duplicateCombo(999)
    controller.removeCombo(999)
    controller.onComboSideValidated({
      id: 0,
      side: 'unknown',
      snapshot: createActionSnapshot(),
    })
    expect(controller.combos.value).toHaveLength(1)
    expect(client.calculateAttackCanonicalBatch).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('disposes the canonical runner and prevents later execution', () => {
    const { controller, client } = createController()
    controller.dispose()
    controller.addCombo()
    expect(client.calculateAttackCanonicalBatch).not.toHaveBeenCalled()
  })
})
