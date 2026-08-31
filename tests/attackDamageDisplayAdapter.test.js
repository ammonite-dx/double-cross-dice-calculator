import { describe, expect, it } from 'vitest'

import {
  createAttackCanonicalDisplayFeedback,
} from '../src/application/AttackCanonicalDisplayFeedback'
import {
  ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS,
} from '../src/application/AttackCanonicalPresentation'
import { ATTACK_DISPLAY_MODES } from '../src/application/AttackDisplayRequestSnapshot'
import {
  getCanonicalAttackDamageChartData,
} from '../src/components/Attack/ChartSetter'
import {
  CANONICAL_SUMMARY_UNAVAILABLE,
  findCanonicalComboPresentation,
  formatCanonicalSummaryExpectedValue,
} from '../src/components/Attack/SummaryTable'

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

function createCanonicalPresentation(status = 'ready', probabilities = [0.75, 0.25]) {
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
      ? ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.REUSE
      : ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE,
    displayRequest: { min: 0, max: 1, mode: ATTACK_DISPLAY_MODES.PMF },
    combos: [side('combo-1', { kind: 'exact', value: 1.25 })],
    total: side('total', { kind: 'exact', value: 1.25 }),
  }
}

describe('Attack canonical damage display adapters', () => {
  it('passes ready canonical chart data as owned percentage arrays', () => {
    const presentation = createCanonicalPresentation()
    const legacyData = createLegacyAttackData()
    const data = getCanonicalAttackDamageChartData(
      presentation,
      legacyData
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

    const roundedPresentation = createCanonicalPresentation(
      'ready',
      [0.75, 0.12345]
    )
    const roundedData = getCanonicalAttackDamageChartData(
      roundedPresentation,
      legacyData
    )
    expect(roundedData.datasets[0].data).toEqual([75, 12.3])
    expect(roundedData.datasets[1].data).toEqual([75, 12.3])

    expect(getCanonicalAttackDamageChartData(
      createCanonicalPresentation('not-ready'),
      legacyData
    )).toBeNull()
  })

  it('does not pointify bounded or lower-bound canonical summaries', () => {
    expect(formatCanonicalSummaryExpectedValue({
      kind: 'exact',
      value: 1.26,
    })).toBe(1.3)
    expect(formatCanonicalSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 1,
      upperBound: 2,
    })).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
    expect(formatCanonicalSummaryExpectedValue({
      kind: 'lower-bound',
      lowerBound: 1,
    })).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
    expect(findCanonicalComboPresentation(
      createCanonicalPresentation(),
      'combo-1'
    )?.id).toBe('combo-1')
    expect(formatCanonicalSummaryExpectedValue(undefined))
      .toBe(CANONICAL_SUMMARY_UNAVAILABLE)
  })

  it('turns non-ready canonical decisions into RangePlanNotice feedback', () => {
    const feedback = createAttackCanonicalDisplayFeedback({
      ...createCanonicalPresentation('not-ready'),
      decision: ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE,
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

    const resourceFeedback = createAttackCanonicalDisplayFeedback({
      ...createCanonicalPresentation('not-ready'),
      decision: ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RESOURCE_REJECTED,
    })
    expect(resourceFeedback.plan.warnings[0].code)
      .toBe('attack-display-resource-rejected')
  })

  it('suppresses normal approximation and non-exact summary warnings', () => {
    const presentation = createCanonicalPresentation()
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

    expect(createAttackCanonicalDisplayFeedback(presentation)).toEqual({
      status: 'idle',
      plan: null,
      error: null,
    })
  })
})
