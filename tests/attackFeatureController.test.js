import { describe, expect, it, vi } from 'vitest'

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
