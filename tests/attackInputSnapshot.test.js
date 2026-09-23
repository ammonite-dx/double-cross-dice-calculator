import { describe, expect, it } from 'vitest'

import {
  createAttackInputSnapshot,
  createDefenceInputSnapshot,
  createDefenceInputDraftSnapshot,
  normalizeAttackInputDraft,
  replaceAttackSideSnapshot,
} from '../src/features/attack/model/AttackInputSnapshot'
import { createLatestValidationGate } from '../src/shared/validation/LatestValidationGate'

function createAttackDraft() {
  return {
    score: {dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0},
    damage: {dice: 4, value: 11, kazanari: 2},
  }
}

function createDefenceDraft(mode = 'ドッジ') {
  return {
    mode,
    score: {dice: 3, critical: 9, skill: 4, yousei: 1, shihai: 0},
    damage: {dice: 2, value: 5},
  }
}

describe('AttackInputSnapshot', () => {
  it('normalizes the attack draft without changing its values', () => {
    expect(normalizeAttackInputDraft(createAttackDraft())).toEqual({
      score: {dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0},
      damage: {dice: 4, value: 11, kazanari: 2},
    })
  })

  it('keeps snapshots independent from drafts and nested values', () => {
    const draft = createAttackDraft()
    const snapshot = createAttackInputSnapshot(draft)

    expect(snapshot).not.toBe(draft)
    expect(snapshot.score).not.toBe(draft.score)
    expect(snapshot.damage).not.toBe(draft.damage)

    draft.score.dice = 99
    draft.damage.value = 99
    snapshot.score.skill = 99

    expect(snapshot.score.dice).toBe(7)
    expect(snapshot.damage.value).toBe(11)
    expect(draft.score.skill).toBe(3)
  })

  it('keeps Defence snapshots in raw editable coordinates', () => {
    for (const mode of [
      'ドッジ',
      '《イベイジョン》',
      'ガード・リアクション放棄',
    ]) {
      const draft = createDefenceDraft(mode)
      const snapshot = createDefenceInputSnapshot(draft)
      expect(snapshot).toEqual(draft)
      expect(snapshot.score.dice).toBe(3)
      expect(snapshot.score.skill).toBe(4)
    }
  })

  it('replaces one side with a second alias-free snapshot', () => {
    const params = {
      action: createAttackDraft(),
      reaction: createDefenceDraft(),
    }
    const nextAction = createAttackInputSnapshot({
      score: {dice: 2, critical: 10, skill: 1, yousei: 0, shihai: 0},
      damage: {dice: 1, value: 3, kazanari: 0},
    })

    const installed = replaceAttackSideSnapshot(params, 'action', nextAction)

    expect(params.action).toBe(installed)
    expect(params.action).not.toBe(nextAction)
    expect(params.action.score).not.toBe(nextAction.score)
    nextAction.score.dice = 99
    installed.damage.value = 99

    expect(params.action.score.dice).toBe(2)
    expect(nextAction.score.dice).toBe(99)
    expect(params.action.damage.value).toBe(99)

    const reactionSnapshot = createDefenceInputSnapshot(
      createDefenceDraft('《イベイジョン》')
    )
    replaceAttackSideSnapshot(params, 'reaction', reactionSnapshot)
    expect(params.reaction.score).toEqual(reactionSnapshot.score)
  })

  it('keeps Defence draft snapshots in the editable coordinate system', () => {
    const draft = createDefenceDraft('《イベイジョン》')
    const snapshot = createDefenceInputDraftSnapshot(draft)

    expect(snapshot).toEqual(draft)
    expect(snapshot).not.toBe(draft)
    expect(snapshot.score).not.toBe(draft.score)
    draft.score.dice = 99
    expect(snapshot.score.dice).toBe(3)
  })

  it('commits only the newest validation ticket and never after disposal', () => {
    const gate = createLatestValidationGate()
    const firstTicket = gate.begin()
    const latestTicket = gate.begin()

    expect(gate.canCommit(firstTicket)).toBe(false)
    expect(gate.canCommit(latestTicket)).toBe(true)

    gate.invalidate()
    expect(gate.canCommit(latestTicket)).toBe(false)

    const disposableTicket = gate.begin()
    expect(gate.canCommit(disposableTicket)).toBe(true)
    gate.dispose()
    expect(gate.canCommit(disposableTicket)).toBe(false)
    expect(gate.canCommit(gate.begin())).toBe(false)
  })
})
