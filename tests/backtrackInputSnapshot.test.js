import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createBacktrackInputSnapshot,
  normalizeBacktrackInputDraft,
} from '../src/features/backtrack/model/BacktrackInputSnapshot'

const backtrackViewSource = readFileSync(
  new URL('../src/views/Backtrack.vue', import.meta.url),
  'utf8'
)
const backtrackPageSource = readFileSync(
  new URL('../src/features/backtrack/ui/BacktrackPage.vue', import.meta.url),
  'utf8'
)
const inputFormSource = readFileSync(
  new URL('../src/features/backtrack/ui/InputForm.vue', import.meta.url),
  'utf8'
)
const inputPanelSource = readFileSync(
  new URL('../src/features/backtrack/ui/InputPanel.vue', import.meta.url),
  'utf8'
)
const backtrackFormSource = readFileSync(
  new URL('../src/features/backtrack/ui/BacktrackForm.vue', import.meta.url),
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
  it('keeps the Backtrack template input boundary free of the temporary toggle', () => {
    const backtrackTemplate = backtrackViewSource.match(
      /<template>([\s\S]*)<\/template>/
    )?.[1]
    expect(backtrackTemplate).toMatch(/<BacktrackPage\s*\/>/)
    expect(backtrackPageSource).toMatch(/<InputPanel\b[\s\S]*@validated=/)
    expect(backtrackTemplate).not.toMatch(/canonicalOptIn|canonical-toggle/)
    expect(backtrackPageSource).not.toMatch(/canonicalOptIn|canonical-toggle/)
  })

  it('forwards only validated events through InputForm and InputPanel', () => {
    expect(inputFormSource).toContain("defineEmits(['validated'])")
    expect(inputFormSource).toContain('@validated="onValidated"')
    expect(inputPanelSource).toMatch(
      /defineEmits\(\s*\[\s*['"]validated['"]\s*\]\s*\)/
    )
    expect(inputPanelSource).toMatch(/@validated\s*=\s*['"]onValidated['"]/
    )
    expect(inputPanelSource).not.toMatch(/canonicalOptIn|canonical-toggle|<v-switch/)
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
