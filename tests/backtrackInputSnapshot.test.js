import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createBacktrackInputSnapshot,
  normalizeBacktrackInputDraft,
} from '../src/application/BacktrackInputSnapshot'

const backtrackViewSource = readFileSync(
  new URL('../src/views/Backtrack.vue', import.meta.url),
  'utf8'
)
const inputFormSource = readFileSync(
  new URL('../src/components/Backtrack/InputForm.vue', import.meta.url),
  'utf8'
)
const inputPanelSource = readFileSync(
  new URL('../src/components/Backtrack/InputPanel.vue', import.meta.url),
  'utf8'
)
const backtrackFormSource = readFileSync(
  new URL('../src/components/Backtrack/BacktrackForm.vue', import.meta.url),
  'utf8'
)

function createDraft() {
  return {
    params: {
      encroachment: 87,
      lois: 3,
      elois: 2,
      dice: 4,
      value: 11,
      dlois: '屍人',
    },
  }
}

describe('BacktrackInputSnapshot', () => {
  it('normalizes every Backtrack form field without changing its value', () => {
    expect(normalizeBacktrackInputDraft(createDraft())).toEqual({
      params: {
        encroachment: 87,
        lois: 3,
        elois: 2,
        dice: 4,
        value: 11,
        dlois: '屍人',
      },
    })
  })

  it('does not alias the draft or its nested params object', () => {
    const draft = createDraft()
    const snapshot = createBacktrackInputSnapshot(draft)

    expect(snapshot).not.toBe(draft)
    expect(snapshot.params).not.toBe(draft.params)

    draft.params.encroachment = 99
    draft.params.dlois = 'なし'
    snapshot.params.value = 999

    expect(snapshot.params.encroachment).toBe(87)
    expect(snapshot.params.dlois).toBe('屍人')
    expect(draft.params.value).toBe(11)
  })
})

describe('Backtrack input flow contracts', () => {
  it('keeps state, runner, result commit, and snapshot submission in Backtrack.vue', () => {
    expect(backtrackViewSource).toContain(
      'createBacktrackCalculationRunner'
    )
    expect(backtrackViewSource).toContain(
      'createBacktrackCalculationSnapshot({'
    )
    expect(backtrackViewSource).toContain(
      'const initialSnapshot = createBacktrackInputSnapshot({'
    )
    expect(backtrackViewSource).toContain('void calculationRunner.run(snapshot)')
    expect(backtrackViewSource).toContain('calculationRunner.dispose()')
    expect(backtrackViewSource).toContain('@validated="onBacktrackValidated"')
    expect(backtrackViewSource).toContain(
      '@canonical-toggle="onBacktrackCanonicalToggle"'
    )
    expect(backtrackViewSource).not.toContain('watch(')
  })

  it('forwards only validated events through InputForm and InputPanel', () => {
    expect(inputFormSource).toContain("defineEmits(['validated'])")
    expect(inputFormSource).toContain('@validated="onValidated"')
    expect(inputPanelSource).toContain(
      "defineEmits(['validated', 'canonical-toggle'])"
    )
    expect(inputPanelSource).toContain('@validated="onValidated"')
    expect(inputFormSource).not.toContain('createLatestCalculationRunner')
    expect(inputPanelSource).not.toContain('createLatestCalculationRunner')
  })

  it('guards asynchronous Backtrack validation with a generation', () => {
    expect(backtrackFormSource).toContain('let validationGeneration = 0')
    expect(backtrackFormSource).toContain(
      'const generation = ++validationGeneration'
    )
    expect(backtrackFormSource).toContain(
      'if (generation !== validationGeneration)'
    )
    expect(backtrackFormSource).toContain("emit('validated', draft)")
  })

  it('does not assign nested Backtrack props from the form', () => {
    expect(backtrackFormSource).not.toMatch(/props\.params\.[\w]+\s*=/)
  })
})
