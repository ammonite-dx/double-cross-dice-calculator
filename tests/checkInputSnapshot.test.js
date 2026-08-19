import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createCheckInputSnapshot,
  normalizeCheckInputDraft,
} from '../src/application/CheckInputSnapshot'

const checkViewSource = readFileSync(
  new URL('../src/views/Check.vue', import.meta.url),
  'utf8'
)
const scoreChartSource = readFileSync(
  new URL('../src/components/Check/ScoreChart.vue', import.meta.url),
  'utf8'
)
const chartSetterSource = readFileSync(
  new URL('../src/components/Check/ChartSetter.js', import.meta.url),
  'utf8'
)
const inputFormSource = readFileSync(
  new URL('../src/components/Check/InputForm.vue', import.meta.url),
  'utf8'
)
const inputPanelSource = readFileSync(
  new URL('../src/components/Check/InputPanel.vue', import.meta.url),
  'utf8'
)
const difficultyFormSource = readFileSync(
  new URL('../src/components/Check/DfcltyForm.vue', import.meta.url),
  'utf8'
)
const scoreFormSource = readFileSync(
  new URL('../src/components/Check/ScoreForm.vue', import.meta.url),
  'utf8'
)

function createDraft() {
  return {
    dfclty: { opposed: true, target: 17 },
    params: {
      action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
      reaction: { dice: 5, critical: 9, skill: -2, yousei: 0, shihai: 4 },
    },
  }
}

describe('CheckInputSnapshot', () => {
  it('normalizes the form draft to the calculation snapshot shape', () => {
    expect(normalizeCheckInputDraft(createDraft())).toEqual({
      difficulty: { opposed: true, target: 17 },
      params: {
        action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
        reaction: { dice: 5, critical: 9, skill: -2, yousei: 0, shihai: 4 },
      },
    })
  })

  it('does not alias the draft or any nested input object', () => {
    const draft = createDraft()
    const snapshot = createCheckInputSnapshot(draft)

    expect(snapshot).not.toBe(draft)
    expect(snapshot.difficulty).not.toBe(draft.dfclty)
    expect(snapshot.params).not.toBe(draft.params)
    expect(snapshot.params.action).not.toBe(draft.params.action)
    expect(snapshot.params.reaction).not.toBe(draft.params.reaction)

    draft.dfclty.target = 99
    draft.params.action.dice = 99
    snapshot.params.reaction.skill = 99

    expect(snapshot.difficulty.target).toBe(17)
    expect(snapshot.params.action.dice).toBe(7)
    expect(draft.params.reaction.skill).toBe(-2)
  })
})

describe('Check input flow contracts', () => {
  it('keeps calculation ownership and snapshot expansion in Check.vue', () => {
    expect(checkViewSource).toContain(
      'calculationClient.calculateCheckCanonical(\n            snapshot.params,\n            snapshot.difficulty'
    )
    expect(checkViewSource).toContain('calculationClient.calculateCheckCanonical(')
    expect(checkViewSource).not.toContain('calculationClient.calculateCheck(')
    expect(checkViewSource).toContain(
      'snapshotRequest: createCheckInputSnapshot'
    )
    expect(checkViewSource).toContain('calculationRunner.dispose()')
    expect(checkViewSource).toContain('@dfclty-validated="onDfcltyValidated"')
    expect(checkViewSource).toContain('@score-validated="onScoreValidated"')
    expect(checkViewSource).not.toContain('watch(props.checkData')
  })

  it('connects Check charts to canonical presentation without a legacy data path', () => {
    expect(scoreChartSource).toContain('createCheckCanonicalPresentation')
    expect(scoreChartSource).toContain('displayWindow:')
    expect(scoreChartSource).toContain('min: props.setting.min')
    expect(scoreChartSource).toContain('max: props.setting.max')
    expect(scoreChartSource).toContain('opposed: props.checkData.dfclty.opposed')
    expect(scoreChartSource).toContain(
      "'達成値がXとなる確率を表示': CHECK_CANONICAL_PRESENTATION_MODES.PMF"
    )
    expect(scoreChartSource).toContain(
      "'達成値がX以上となる確率を表示': CHECK_CANONICAL_PRESENTATION_MODES.UPPER_TAIL"
    )
    expect(scoreChartSource).toContain(
      'function getCanonicalChartMode(settingMode)'
    )
    expect(scoreChartSource).toContain('throw new Error(')
    expect(scoreChartSource).toContain(
      'mode: getCanonicalChartMode(props.setting.mode)'
    )
    expect(scoreChartSource).not.toContain(
      '?? CHECK_CANONICAL_PRESENTATION_MODES.PMF'
    )
    expect(scoreChartSource).toContain(
      '<Line v-if="data !== null" :data="data"'
    )
    expect(scoreChartSource).not.toContain('getCheckChartData')
    expect(chartSetterSource).toContain('getCheckChartOptions')
    expect(chartSetterSource).toContain('getCheckChartStyle')
    expect(chartSetterSource).not.toContain('@/data/Distribution')
    expect(chartSetterSource).not.toContain('getCheckChartData')
  })

  it('forwards only validated child events through the input components', () => {
    expect(inputFormSource).toContain("defineEmits(['dfclty-validated', 'score-validated'])")
    expect(inputFormSource).toContain('@validated="onDfcltyValidated"')
    expect(inputFormSource).toContain('@validated="(params) => onScoreValidated(')
    expect(inputPanelSource).toContain('@dfclty-validated="onDfcltyValidated"')
    expect(inputPanelSource).toContain('@score-validated="onScoreValidated"')
  })

  it('guards asynchronous child validation with a generation', () => {
    for (const source of [difficultyFormSource, scoreFormSource]) {
      expect(source).toContain('let validationGeneration = 0')
      expect(source).toContain('const generation = ++validationGeneration')
      expect(source).toContain('if (generation !== validationGeneration)')
      expect(source).toContain("emit('validated', draft)")
    }
  })

  it('does not let Check forms assign nested props', () => {
    expect(difficultyFormSource).not.toMatch(/props\.dfclty\.[\w]+\s*=/)
    expect(scoreFormSource).not.toMatch(/props\.params\.[\w]+\s*=/)
  })
})
