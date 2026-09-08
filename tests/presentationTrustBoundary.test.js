import { describe, expect, it } from 'vitest'

import {
  createDistributionResult,
  getTotalDamageStatistics,
} from '../src/calculation/DistributionResult'
import { getDamageStatistics } from '../src/calculation/DamageCalculator'
import {
  createAttackPresentation,
} from '../src/features/attack/model/AttackPresentation'
import {
  createChartSeries,
  planDisplayRange,
  presentDistribution,
} from '../src/shared/presentation'

function createEnvelope({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: offset + values.length - 1 },
} = {}) {
  const result = createDistributionResult({
    values,
    offset,
    support,
    overflow: null,
  })
  return {
    result,
    metadata: {
      modeledDistribution: true,
      sourceSupport: support,
    },
  }
}

function createScoreEnvelope() {
  return createEnvelope({ values: [0.5, 0.5], support: { kind: 'finite', max: 1 } })
}

describe('presentation trust boundary', () => {
  it('reuses certified summaries while owning explicit display probabilities', () => {
    const envelope = createEnvelope({
      values: new Float64Array([0.25, 0.75]),
      offset: 2,
      support: { kind: 'finite', max: 3 },
    })
    const summary = getDamageStatistics(envelope)
    const details = { source: 'planner', limits: { max: 64 } }
    const warning = { code: 'range-warning', severity: 'warning', details }
    const display = presentDistribution(envelope, {
      summary,
      warnings: [warning],
      displayWindow: { min: 2, max: 3 },
    })

    expect(display.mass).toBe(summary.mass)
    expect(display.expectedValue).toBe(summary.expectedValue)
    expect(display.explicit.probabilities).not.toBe(envelope.result.values)
    expect(display.explicit.probabilities).toEqual([0.25, 0.75])
    expect(display.displayWindow).toEqual({ min: 2, max: 3 })
    expect(display.warnings[0]).not.toBe(warning)
    expect(display.warnings[0].details).toBe(details)
    expect(Object.isFrozen(display)).toBe(true)
    expect(Object.isFrozen(display.explicit)).toBe(true)
    expect(Object.isFrozen(display.warnings)).toBe(true)
    expect(Object.isFrozen(details)).toBe(false)
  })

  it('keeps attack calculation-owned envelopes and plans out of generic cloning', () => {
    const damage = createEnvelope({ values: [1], support: { kind: 'finite', max: 0 } })
    const score = {
      action: createScoreEnvelope(),
      reaction: createScoreEnvelope(),
    }
    const scoreStatistics = {
      action: { expectedValue: { kind: 'exact', value: 0.5 } },
      reaction: { expectedValue: { kind: 'exact', value: 0.5 } },
    }
    const damageStatistics = getDamageStatistics(damage)
    const totalDamage = damage
    const totalDamageStatistics = getTotalDamageStatistics(totalDamage)
    const warning = { code: 'plan-warning', severity: 'warning' }
    const plan = { operation: 'attack', warnings: [warning], nested: { owner: true } }
    const batch = {
      combos: [{
        id: 'combo-1',
        score,
        scoreStatistics,
        damage,
        damageStatistics,
      }],
      totalDamage,
      totalDamageStatistics,
    }

    const presentation = createAttackPresentation(batch, [plan])

    expect(presentation.combos[0].score).toBe(score)
    expect(presentation.combos[0].scoreStatistics).toBe(scoreStatistics)
    expect(presentation.combos[0].damage).toBe(damage)
    expect(presentation.combos[0].damageStatistics).toBe(damageStatistics)
    expect(presentation.totalDamage).toBe(totalDamage)
    expect(presentation.totalDamageStatistics).toBe(totalDamageStatistics)
    expect(presentation.combos[0].rangePlan).not.toBe(plan)
    expect(plan.nested).toEqual({ owner: true })
    expect(plan.warnings).toEqual([warning])
    expect(Object.isFrozen(presentation)).toBe(true)
    expect(Object.isFrozen(presentation.combos)).toBe(true)
    expect(Object.isFrozen(presentation.combos[0])).toBe(true)
  })

  it('keeps chart projection safety at the numeric and allocation boundary', () => {
    const envelope = createEnvelope({ values: [0.25, 0.75] })
    const display = presentDistribution(envelope, {
      summary: getDamageStatistics(envelope),
    })
    const plan = planDisplayRange(display, {
      displayWindow: { min: 0, max: 1 },
    })
    const series = createChartSeries(display, plan)

    expect(series.status).toBe('ready')
    expect(series.values).toEqual(new Float64Array([0.25, 0.75]))
    expect(series.values).not.toBe(display.explicit.probabilities)
    expect(Object.isFrozen(series)).toBe(true)
  })
})
