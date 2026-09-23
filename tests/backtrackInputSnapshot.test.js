import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createBacktrackInputSnapshot,
  normalizeBacktrackInputDraft,
} from '../src/features/backtrack/model/BacktrackInputSnapshot'

const backtrackPageSource = readFileSync(
  new URL('../src/features/backtrack/ui/BacktrackPage.vue', import.meta.url),
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
    expect(backtrackPageSource).toMatch(/<InputPanel\b[\s\S]*@validated=/)
    expect(backtrackPageSource).not.toMatch(/OptIn|canonical-toggle/)
  })

  it('forwards only validated events through BacktrackForm and InputPanel', () => {
    expect(backtrackFormSource).toContain(
      'validated: [params: Partial<BacktrackParams>]'
    )
    expect(inputPanelSource).toContain('<BacktrackForm')
    expect(inputPanelSource).toContain('@validated="onValidated"')
    expect(inputPanelSource).toContain(
      'validated: [params: Partial<BacktrackParams>]'
    )
    expect(inputPanelSource).toMatch(/@validated\s*=\s*['"]onValidated['"]/
    )
    expect(inputPanelSource).not.toMatch(/OptIn|canonical-toggle|<v-switch/)
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

  it('uses the shared remaining-Lois domain boundary in the form', () => {
    expect(backtrackFormSource).toContain("@/domain/InputDomain")
    expect(backtrackFormSource).toContain(
      'INPUT_DOMAIN.remainingLois.max'
    )
    expect(backtrackFormSource).not.toMatch(/(?:max=7|value<=7)/)
  })

  it('does not assign nested Backtrack props from the form', () => {
    expect(backtrackFormSource).not.toMatch(/props\.params\.[\w]+\s*=/)
  })

  it('keeps the compound reduction controls accessible and aligned', () => {
    expect(backtrackFormSource).toContain('import { ref,reactive,useId,watch } from \'vue\';')
    expect(backtrackFormSource).toContain('const otherReductionGroupId = useId();')
    expect(backtrackFormSource).toContain('class="other-reduction-group"')
    expect(backtrackFormSource).toContain('role="group"')
    expect(backtrackFormSource).toContain(':aria-labelledby="otherReductionGroupId"')
    expect(backtrackFormSource).toContain('class="other-reduction-group__label text-caption text-medium-emphasis"')
    expect(backtrackFormSource).toContain('label="その他減少量（ダイス）"')
    expect(backtrackFormSource).toContain('label="その他減少量（固定値）"')
    expect(backtrackFormSource).toContain('inset-block-start: -4px;')
    expect(backtrackFormSource).not.toContain('font-size:')
    expect(backtrackFormSource).not.toContain('line-height:')

    const templateCloseIndex = backtrackFormSource.lastIndexOf('</template>')
    const styleOpenIndex = backtrackFormSource.indexOf('<style scoped>')
    expect(styleOpenIndex).toBeGreaterThan(templateCloseIndex)
    expect(backtrackFormSource.slice(0, templateCloseIndex)).not.toContain('<style scoped>')
  })
})
