import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createAttackInputSnapshot,
  createDefenceInputDraftSnapshot,
  normalizeAttackInputDraft,
  normalizeDefenceInputDraft,
  replaceAttackSideSnapshot,
} from '../src/application/AttackInputSnapshot'
import { createLatestValidationGate } from '../src/shared/validation/LatestValidationGate'

const attackFormSource = readFileSync(
  new URL('../src/features/attack/ui/AttackForm.vue', import.meta.url),
  'utf8'
)
const defenceFormSource = readFileSync(
  new URL('../src/features/attack/ui/DefenceForm.vue', import.meta.url),
  'utf8'
)
const comboFormSource = readFileSync(
  new URL('../src/features/attack/ui/ComboForm.vue', import.meta.url),
  'utf8'
)
const inputFormSource = readFileSync(
  new URL('../src/features/attack/ui/InputForm.vue', import.meta.url),
  'utf8'
)
const attackSnapshotSource = readFileSync(
  new URL('../src/application/AttackInputSnapshot.js', import.meta.url),
  'utf8'
)

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
  it('keeps async validation coordination in the shared validation layer', () => {
    expect(attackSnapshotSource).not.toContain('createLatestValidationGate')
  })

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

  it('preserves Defence mode normalization and effective score values', () => {
    const dodge = normalizeDefenceInputDraft(createDefenceDraft('ドッジ'))
    const evasion = normalizeDefenceInputDraft(
      createDefenceDraft('《イベイジョン》')
    )
    const guard = normalizeDefenceInputDraft(
      createDefenceDraft('ガード・リアクション放棄')
    )

    expect(dodge).toEqual(createDefenceDraft('ドッジ'))
    expect(evasion).toEqual({
      mode: '《イベイジョン》',
      score: {dice: 0, critical: 10, skill: 10, yousei: 0, shihai: 0},
      damage: {dice: 2, value: 5},
    })
    expect(guard).toEqual({
      mode: 'ガード・リアクション放棄',
      score: {dice: 0, critical: 10, skill: 0, yousei: 0, shihai: 0},
      damage: {dice: 2, value: 5},
    })
    expect(normalizeDefenceInputDraft(createDefenceDraft('unknown'))).toBeNull()
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

    const effectiveReaction = normalizeDefenceInputDraft(
      createDefenceDraft('《イベイジョン》')
    )
    replaceAttackSideSnapshot(params, 'reaction', effectiveReaction)
    expect(params.reaction.score).toEqual({
      dice: 0,
      critical: 10,
      skill: 10,
      yousei: 0,
      shihai: 0,
    })
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

describe('Attack input flow contracts', () => {
  it('guards asynchronous form validation and emits only validated snapshots', () => {
    for (const source of [attackFormSource, defenceFormSource]) {
      expect(source).toContain("defineEmits(['validated', 'show-details'])")
      expect(source).toContain("@/shared/validation/LatestValidationGate")
      expect(source).toContain('const ticket = validationGate.begin()')
      expect(source).toContain('validationGate.canCommit(ticket)')
      expect(source).toContain('validationGate.dispose()')
      expect(source).toContain("emit('validated',")
      expect(source).not.toMatch(/props\.params\.[\w.]+\s*=/)
      expect(source).not.toContain('props.showDetails.value =')
    }
  })

  it('passes validated snapshots to the parent canonical lane', () => {
    expect(comboFormSource).not.toContain('watch(')
    expect(comboFormSource).not.toContain('onMounted')
    expect(comboFormSource).not.toContain('onUnmounted')
    expect(comboFormSource).not.toContain('createLatestCalculationRunner')
    expect(comboFormSource).not.toContain('calculateAttackCombo')
    expect(comboFormSource).not.toContain('replaceAttackSideSnapshot(')
    expect(comboFormSource).toContain(
      "@validated=\"(snapshot) => onSideValidated('action', snapshot)\""
    )
    expect(comboFormSource).toContain(
      "@validated=\"(snapshot) => onSideValidated('reaction', snapshot)\""
    )

    const handlerStart = comboFormSource.indexOf('const onSideValidated')
    const handlerEnd = comboFormSource.indexOf('const onShowDetails')
    const handler = comboFormSource.slice(handlerStart, handlerEnd)
    expect(handler).not.toContain('updateCombo')
    expect(inputFormSource).not.toContain('calculateTotalDamage')
  })

  it('passes explicit show-details events through InputForm', () => {
    expect(attackFormSource).toContain("emit('show-details', value)")
    expect(defenceFormSource).toContain("emit('show-details', value)")
    expect(comboFormSource).toContain(
      "@show-details=\"(value) => onShowDetails('action', value)\""
    )
    expect(comboFormSource).toContain(
      "@show-details=\"(value) => onShowDetails('reaction', value)\""
    )
    expect(inputFormSource).toContain('@show-details="(change) => onDetailsChanged(combo, change)"')
  })
})
