import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createCheckInputSnapshot,
  normalizeCheckInputDraft,
} from '../src/features/check/model/CheckInputSnapshot'

const checkViewSource = readFileSync(
  new URL('../src/views/Check.vue', import.meta.url),
  'utf8'
)
const checkControllerSource = readFileSync(
  new URL('../src/features/check/model/useCheck.ts', import.meta.url),
  'utf8'
)
const checkPageSource = readFileSync(
  new URL('../src/features/check/ui/CheckPage.vue', import.meta.url),
  'utf8'
)
const scoreChartSource = readFileSync(
  new URL('../src/features/check/ui/ScoreChart.vue', import.meta.url),
  'utf8'
)
const chartSetterSource = readFileSync(
  new URL('../src/features/check/ui/ChartSetter.js', import.meta.url),
  'utf8'
)
const inputFormSource = readFileSync(
  new URL('../src/features/check/ui/InputForm.vue', import.meta.url),
  'utf8'
)
const inputPanelSource = readFileSync(
  new URL('../src/features/check/ui/InputPanel.vue', import.meta.url),
  'utf8'
)
const difficultyFormSource = readFileSync(
  new URL('../src/features/check/ui/DfcltyForm.vue', import.meta.url),
  'utf8'
)
const scoreFormSource = readFileSync(
  new URL('../src/features/check/ui/ScoreForm.vue', import.meta.url),
  'utf8'
)
const settingFormSource = readFileSync(
  new URL('../src/features/check/ui/SettingForm.vue', import.meta.url),
  'utf8'
)
const chartPanelSource = readFileSync(
  new URL('../src/features/check/ui/ChartPanel.vue', import.meta.url),
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
  it('keeps calculation ownership and snapshot expansion in the Check feature model', () => {
    expect(checkControllerSource).toContain('calculationClient.calculateCheckCanonical(')
    expect(checkControllerSource).toContain('snapshot.params')
    expect(checkControllerSource).toContain('snapshot.difficulty')
    expect(checkControllerSource).not.toContain('calculationClient.calculateCheck(')
    expect(checkControllerSource).toContain(
      'snapshotRequest: createCheckCalculationRequestSnapshot'
    )
    expect(checkControllerSource).toContain('displayRequest: initialCalculationRequest.displayRequest')
    expect(checkControllerSource).toContain('calculationRunner.dispose()')
    expect(checkPageSource).toContain('useCheck({ calculationClient })')
    expect(checkPageSource).toContain('@dfclty-validated="onDifficultyValidated"')
    expect(checkPageSource).toContain('@score-validated="onScoreValidated"')
    expect(checkViewSource).not.toContain('calculationClient.calculateCheckCanonical(')
    expect(checkViewSource).not.toContain('watch(props.checkData')
  })

  it('connects Check charts to canonical presentation without a legacy data path', () => {
    expect(scoreChartSource).not.toContain('createCheckCanonicalPresentation')
    expect(scoreChartSource).not.toContain('displayRequest')
    expect(scoreChartSource).not.toContain('CHECK_DISPLAY_MODE_LABELS')
    expect(scoreChartSource).not.toContain('CHECK_DISPLAY_MODES')
    expect(scoreChartSource).toContain(
      "props.presentation?.status === 'ready'"
    )
    expect(scoreChartSource).toContain('props.presentation.chart')
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
    expect(inputFormSource).toContain('props.difficulty')
    expect(inputFormSource).toContain('props.scoreParams')
    expect(inputFormSource).toContain("defineEmits(['dfclty-validated', 'score-validated'])")
    expect(inputFormSource).toContain('@validated="onDfcltyValidated"')
    expect(inputFormSource).toContain('@validated="(params) => onScoreValidated(')
    expect(inputPanelSource).toContain('@dfclty-validated="onDfcltyValidated"')
    expect(inputPanelSource).toContain('@score-validated="onScoreValidated"')
  })

  it('guards asynchronous child validation with the shared gate', () => {
    for (const source of [difficultyFormSource, scoreFormSource]) {
      expect(source).toContain("@/shared/validation/LatestValidationGate")
      expect(source).toContain('const ticket = validationGate.begin()')
      expect(source).toContain('validationGate.canCommit(ticket)')
      expect(source).toContain("emit('validated', draft)")
    }
  })

  it('does not let Check forms assign nested props', () => {
    expect(difficultyFormSource).not.toMatch(/props\.dfclty\.[\w]+\s*=/)
    expect(scoreFormSource).not.toMatch(/props\.params\.[\w]+\s*=/)
    expect(settingFormSource).not.toMatch(/props\.displayRequest\.[\w]+\s*=/)
    expect(settingFormSource).not.toContain('max=999')
    expect(settingFormSource).not.toContain('max="999"')
    expect(settingFormSource).toContain("@/shared/validation/LatestValidationGate")
    expect(settingFormSource).toContain("@/shared/validation/DisplayRangeRules")
    expect(settingFormSource).toContain('const ticket = validationGate.begin()')
    expect(settingFormSource).toContain('validationGate.canCommit(ticket)')
    expect(settingFormSource).toContain('validationGate.dispose()')
    expect(settingFormSource).toContain("emit('validated', snapshot)")
  })

  it('keeps display ownership in Check and wires explicit props/events through the chart panel', () => {
    expect(checkControllerSource).toContain('displayRequest: { ...initialDisplayRequest }')
    expect(checkControllerSource).toContain('planDisplayWindowResources')
    expect(checkControllerSource).toContain('if (!windowChanged)')
    expect(checkControllerSource).toContain('requestDisplayRecalculation(snapshot)')
    expect(checkControllerSource).toContain('void submitCheck(request)')
    expect(checkControllerSource).toContain('displayRecalculationKey')
    expect(chartPanelSource).toContain(':displayRequest="props.displayRequest"')
    expect(chartPanelSource).toContain(':difficulty="props.difficulty"')
    expect(chartPanelSource).toContain('@validated="(request) => emit(\'display-validated\', request)"')
    expect(chartPanelSource).toContain('<RangePlanNotice :feedback="props.displayFeedback" />')
    expect(scoreChartSource).not.toContain('getCheckChartData')
    expect(scoreChartSource).not.toContain('legacy')
  })

  it('gates every Check calculation through display preflight and validates before commit', () => {
    expect(checkControllerSource).toContain('function preflightDisplayRequest(')
    expect(checkControllerSource).toContain(
      'if (!preflightDisplayRequest(request))'
    )
    expect(checkControllerSource).toContain(
      'if (!preflightDisplayRequest(snapshot))'
    )

    const presentationIndex = checkControllerSource.indexOf(
      'committedPresentation = buildPresentationForScore(result.score)'
    )
    const scoreCommitIndex = checkControllerSource.indexOf(
      'state.score = result.score'
    )
    expect(presentationIndex).toBeGreaterThanOrEqual(0)
    expect(scoreCommitIndex).toBeGreaterThan(presentationIndex)
    expect(checkControllerSource).toContain('publishDisplayError(error)')
  })
})
