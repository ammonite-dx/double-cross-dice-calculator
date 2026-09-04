import { describe, expect, it } from 'vitest'

import {
  createAttackDisplayFeedback,
} from '../src/features/attack/model/AttackDisplayFeedback'
import {
  ATTACK_DISPLAY_PRESENTATION_DECISIONS,
} from '../src/features/attack/model/AttackPresentation'
import { ATTACK_DISPLAY_MODES } from '../src/features/attack/model/AttackDisplayRequestSnapshot'
import {
  getAttackDamageChartData,
} from '../src/features/attack/ui/ChartSetter'
import {
  SUMMARY_UNAVAILABLE,
  findComboPresentation,
  formatSummaryExpectedValue,
} from '../src/features/attack/ui/SummaryTable'

function createLegacyAttackData() {
  return {
    combos: [{
      id: 0,
      name: 'コンボ1',
      data: {
        damage: {
          distribution: [0.75, 0.25],
          upperTailProbability: [1, 0.25],
        },
      },
    }, {
      id: 1,
      name: 'コンボ2',
      data: {
        damage: {
          distribution: [0.5, 0.5],
          upperTailProbability: [1, 0.5],
        },
      },
    }],
    totalDamage: {
      distribution: [0.6, 0.4],
      upperTailProbability: [1, 0.4],
    },
    totalDamageReady: true,
  }
}

function createPresentation(status = 'ready', probabilities = [0.75, 0.25]) {
  const values = Float64Array.from(probabilities)
  const side = (id, expectedValue) => ({
    id,
    status,
    display: { expectedValue },
    plan: {
      accepted: status === 'ready',
      status: status === 'ready' ? 'ready' : 'resource-rejected',
      warnings: [],
      displayWindow: { min: 0, max: 1, pointCount: 2 },
    },
    chart: status === 'ready'
      ? {
          labels: [0, 1],
          datasets: [{ data: values, parsing: true }],
        }
      : null,
  })
  return {
    status,
    decision: status === 'ready'
      ? ATTACK_DISPLAY_PRESENTATION_DECISIONS.REUSE
      : ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE,
    displayRequest: { min: 0, max: 1, mode: ATTACK_DISPLAY_MODES.PMF },
    combos: [side('combo-1', { kind: 'exact', value: 1.25 })],
    total: side('total', { kind: 'exact', value: 1.25 }),
  }
}

describe('Attack canonical damage display adapters', () => {
  it('passes ready canonical chart data as owned percentage arrays', () => {
    const presentation = createPresentation()
    const legacyData = createLegacyAttackData()
    const data = getAttackDamageChartData(
      presentation,
      legacyData.combos
    )

    expect(data.labels).toEqual([0, 1])
    expect(data.datasets).toHaveLength(2)
    expect(data.datasets[0].data).toEqual([75, 25])
    expect(data.datasets[0].data).not.toBe(
      presentation.combos[0].chart.datasets[0].data
    )
    expect(data.datasets[1].data).toEqual([75, 25])
    expect(data.datasets[1].data).not.toBe(
      presentation.total.chart.datasets[0].data
    )
    expect(Array.from(presentation.combos[0].chart.datasets[0].data))
      .toEqual([0.75, 0.25])

    const roundedPresentation = createPresentation(
      'ready',
      [0.75, 0.12345]
    )
    const roundedData = getAttackDamageChartData(
      roundedPresentation,
      legacyData.combos
    )
    expect(roundedData.datasets[0].data).toEqual([75, 12.3])
    expect(roundedData.datasets[1].data).toEqual([75, 12.3])

    expect(getAttackDamageChartData(
      createPresentation('not-ready'),
      legacyData.combos
    )).toBeNull()
  })

  it('does not pointify bounded or lower-bound canonical summaries', () => {
    expect(formatSummaryExpectedValue({
      kind: 'exact',
      value: 1.26,
    })).toBe(1.3)
    expect(formatSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 1,
      upperBound: 2,
    })).toBe(SUMMARY_UNAVAILABLE)
    expect(formatSummaryExpectedValue({
      kind: 'lower-bound',
      lowerBound: 1,
    })).toBe(SUMMARY_UNAVAILABLE)
    expect(findComboPresentation(
      createPresentation(),
      'combo-1'
    )?.id).toBe('combo-1')
    expect(formatSummaryExpectedValue(undefined))
      .toBe(SUMMARY_UNAVAILABLE)
  })

  it('turns non-ready canonical decisions into RangePlanNotice feedback', () => {
    const feedback = createAttackDisplayFeedback({
      ...createPresentation('not-ready'),
      decision: ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE,
    })

    expect(feedback).toMatchObject({
      status: 'rejected',
      plan: {
        accepted: false,
        status: 'resource-rejected',
        warnings: [{ code: 'attack-display-recalculate', severity: 'reject' }],
      },
      error: null,
    })

    const resourceFeedback = createAttackDisplayFeedback({
      ...createPresentation('not-ready'),
      decision: ATTACK_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED,
    })
    expect(resourceFeedback.plan.warnings[0].code)
      .toBe('attack-display-resource-rejected')
  })

  it('suppresses normal approximation and non-exact summary warnings', () => {
    const presentation = createPresentation()
    presentation.combos[0].display.expectedValue = {
      kind: 'lower-bound',
      lowerBound: 1,
    }
    presentation.total.display.expectedValue = {
      kind: 'bounded',
      lowerBound: 1,
      upperBound: 2,
    }
    presentation.combos[0].plan.warnings = [{
      code: 'estimated-time',
      severity: 'warning',
    }]

    expect(createAttackDisplayFeedback(presentation)).toEqual({
      status: 'idle',
      plan: null,
      error: null,
    })
  })
})
