import { describe, expect, it } from 'vitest'

import {
  ATTACK_PRESENTATION_ERROR_CODES,
  AttackPresentationError,
  createAttackPresentation,
  isAttackPresentationError,
} from '../src/features/attack/model/AttackPresentation'
import {
  DistributionPresentationError,
} from '../src/shared/presentation'
import {
  createDistributionResult,
  getTotalDamageStatistics,
} from '../src/calculation/DistributionResult'
import { getDamageStatistics } from '../src/calculation/DamageCalculator'
import {
  sumDamage,
} from '../src/calculation/DamageAggregation'

function createEnvelope({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: 0 },
  overflow = null,
} = {}) {
  return Object.freeze({
    result: createDistributionResult({
      values,
      offset,
      support,
      overflow,
    }),
    metadata: Object.freeze({
      modeledDistribution: true,
      sourceSupport: Object.freeze({ kind: 'infinite' }),
    }),
  })
}

function createScore(seed) {
  return {
    action: {
      distribution: [seed, 1 - seed],
      upperTailProbability: [1 - seed, 0],
    },
    reaction: {
      distribution: [1 - seed, seed],
      upperTailProbability: [seed, 0],
    },
  }
}

function createBatch(damages, options = {}) {
  const combos = damages.map((damage, index) => ({
    id: options.ids?.[index] ?? `combo-${index + 1}`,
    score: createScore((index + 1) / (damages.length + 1)),
    scoreStatistics: {
      action: { expectedValue: index + 1 },
      reaction: { expectedValue: index + 2 },
    },
    damage,
    damageStatistics: getDamageStatistics(damage),
    ...(options.legacyFields ? {
      canonicalDamage: { distribution: ['retired'] },
      canonicalDamageStatistics: { expectedValue: 'retired' },
    } : {}),
  }))
  const totalDamage = sumDamage(damages)
  return {
    combos,
    totalDamage,
    totalDamageStatistics:
      getTotalDamageStatistics(totalDamage),
  }
}

function createPlan(warnings = [], extra = {}) {
  return {
    operation: 'attack',
    ...extra,
    warnings,
  }
}

describe('createAttackPresentation', () => {
  it('keeps two combo ids/order/scores and presents each combo plus total', () => {
    const firstDamage = createEnvelope({ offset: 1, support: { kind: 'finite', max: 1 } })
    const secondDamage = createEnvelope({ offset: 3, support: { kind: 'finite', max: 3 } })
    const batch = createBatch([firstDamage, secondDamage], {
      ids: ['first', 42],
    })
    const plans = [createPlan(), createPlan()]

    const presentation = createAttackPresentation(batch, plans)

    expect(presentation.combos.map((combo) => combo.id)).toEqual([
      'first',
      42,
    ])
    expect(presentation.combos.map((combo) => combo.score)).toEqual(
      batch.combos.map((combo) => combo.score)
    )
    expect(presentation.combos[0].damagePresentation)
      .toMatchObject({
        explicit: { offset: 1, probabilities: [1] },
        expectedValue: { kind: 'exact', value: 1 },
      })
    expect(presentation.combos[1].damagePresentation)
      .toMatchObject({
        explicit: { offset: 3, probabilities: [1] },
        expectedValue: { kind: 'exact', value: 3 },
      })
    expect(presentation.totalDamagePresentation)
      .toMatchObject({
        explicit: { offset: 4, probabilities: [1] },
        expectedValue: { kind: 'exact', value: 4 },
      })
    expect(presentation.combos[0].damage).toBe(firstDamage)
    expect(presentation.combos[0].damageStatistics)
      .toBe(batch.combos[0].damageStatistics)
    expect(presentation.totalDamage).toBe(batch.totalDamage)
    expect(presentation.totalDamageStatistics)
      .toBe(batch.totalDamageStatistics)
  })

  it('maps planner warnings one-to-one and flattens total warnings by entry id', () => {
    const firstWarning = {
      code: 'first-warning',
      severity: 'warning',
      details: { order: 1 },
    }
    const secondWarning = {
      code: 'second-warning',
      severity: 'reject',
      details: { order: 2 },
    }
    const thirdWarning = {
      code: 'third-warning',
      severity: 'info',
      details: { order: 3 },
    }
    const batch = createBatch([
      createEnvelope(),
      createEnvelope({ offset: 2, support: { kind: 'finite', max: 2 } }),
    ], { ids: ['a', 'b'] })

    const presentation = createAttackPresentation(batch, [
      createPlan([firstWarning, secondWarning]),
      createPlan([thirdWarning]),
    ])

    expect(presentation.combos[0].damagePresentation.warnings)
      .toEqual([firstWarning, secondWarning])
    expect(presentation.combos[1].damagePresentation.warnings)
      .toEqual([thirdWarning])
    expect(presentation.totalDamagePresentation.warnings)
      .toEqual([
        { ...firstWarning, entryId: 'a' },
        { ...secondWarning, entryId: 'a' },
        { ...thirdWarning, entryId: 'b' },
      ])
    expect(presentation.combos[0].rangePlan.warnings)
      .toEqual([firstWarning, secondWarning])
    expect(presentation.combos[1].rangePlan.warnings)
      .toEqual([thirdWarning])
    expect(firstWarning).toEqual({
      code: 'first-warning',
      severity: 'warning',
      details: { order: 1 },
    })
    expect(presentation.totalDamagePresentation.warnings[0])
      .not.toBe(firstWarning)
  })

  it.each([
    {
      label: 'exact',
      damage: createEnvelope({
        values: [1],
        offset: 4,
        support: { kind: 'finite', max: 4 },
      }),
      expected: { kind: 'exact', value: 4 },
    },
    {
      label: 'bounded',
      damage: createEnvelope({
        values: [0.5],
        support: { kind: 'finite', max: 8 },
        overflow: {
          kind: 'exact',
          lowerBound: 4,
          probability: 0.5,
          errorBound: 0.1,
        },
      }),
      expected: { kind: 'bounded', lowerBound: 2, upperBound: 4 },
    },
    {
      label: 'lower-bound',
      damage: createEnvelope({
        values: [0.5],
        support: { kind: 'infinite' },
        overflow: {
          kind: 'exact',
          lowerBound: 4,
          probability: 0.5,
          errorBound: 0.1,
        },
      }),
      expected: { kind: 'lower-bound', lowerBound: 2 },
    },
  ])('keeps $label summary semantics without recomputation', ({ damage, expected }) => {
    const batch = createBatch([damage])
    const summary = batch.combos[0].damageStatistics
    const totalSummary = batch.totalDamageStatistics
    const presentation = createAttackPresentation(
      batch,
      [createPlan()]
    )

    expect(presentation.combos[0].damageStatistics).toBe(summary)
    expect(presentation.combos[0].damagePresentation.expectedValue)
      .toEqual(expected)
    expect(presentation.totalDamageStatistics).toBe(totalSummary)
    expect(presentation.totalDamagePresentation.expectedValue)
      .toEqual(expected)
  })

  it('keeps overflow separate from explicit probabilities', () => {
    const damage = createEnvelope({
      values: [0.25, 0, 0.25],
      offset: 2,
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 5,
        probability: 0.5,
        errorBound: 0.01,
      },
    })
    const batch = createBatch([damage])
    const presentation = createAttackPresentation(batch, [createPlan()])

    expect(presentation.combos[0].damagePresentation.explicit)
      .toEqual({ offset: 2, probabilities: [0.25, 0, 0.25] })
    expect(presentation.combos[0].damagePresentation.overflow)
      .toEqual({
        kind: 'exact',
        lowerBound: 5,
        probability: 0.5,
        errorBound: 0.01,
      })
    expect(presentation.combos[0].damagePresentation.explicit.probabilities)
      .toHaveLength(3)
  })

  it('returns the empty batch identity with an empty plan list', () => {
    const totalDamage = sumDamage([])
    const batch = {
      combos: [],
      totalDamage,
      totalDamageStatistics:
        getTotalDamageStatistics(totalDamage),
    }

    const presentation = createAttackPresentation(batch)

    expect(presentation.combos).toEqual([])
    expect(presentation.combos).not.toBe(batch.combos)
    expect(presentation.totalDamage).toBe(totalDamage)
    expect(presentation.totalDamagePresentation)
      .toMatchObject({
        explicit: { offset: 0, probabilities: [1] },
        explicitMax: 0,
        expectedValue: { kind: 'exact', value: 0 },
        warnings: [],
      })
  })

  it('does not mutate input and reuses owned score/statistics references', () => {
    const damage = createEnvelope()
    const batch = createBatch([damage], { legacyFields: true })
    const plan = createPlan([], {
      scores: [{ tail: { bound: 0.01 } }],
    })
    const scoreBefore = JSON.parse(JSON.stringify(batch.combos[0].score))
    const summaryBefore = JSON.parse(JSON.stringify(batch.combos[0].scoreStatistics))
    const planBefore = JSON.parse(JSON.stringify(plan))

    const presentation = createAttackPresentation(batch, [plan])

    expect(presentation.combos).not.toBe(batch.combos)
    expect(presentation.combos[0]).not.toBe(batch.combos[0])
    expect(presentation.combos[0].score).toBe(batch.combos[0].score)
    expect(presentation.combos[0].scoreStatistics)
      .toBe(batch.combos[0].scoreStatistics)
    expect(presentation.combos[0].rangePlan).not.toBe(plan)
    expect(presentation.combos[0].damage).toBe(damage)
    expect(presentation.combos[0].damageStatistics)
      .toBe(batch.combos[0].damageStatistics)
    expect(presentation.combos[0]).not.toHaveProperty('canonicalDamage')
    expect(presentation.combos[0]).not.toHaveProperty('canonicalDamageStatistics')
    expect(batch.combos[0]).not.toHaveProperty('damagePresentation')

    expect(batch.combos[0].score).toEqual(JSON.parse(JSON.stringify(scoreBefore)))
    expect(batch.combos[0].scoreStatistics)
      .toEqual(JSON.parse(JSON.stringify(summaryBefore)))
    expect(plan).toEqual(JSON.parse(JSON.stringify(planBefore)))
  })

  it('freezes presentation containers without freezing owned nested values', () => {
    const warning = {
      code: 'nested',
      severity: 'warning',
      details: { limits: { max: 1024 }, labels: ['tail'] },
    }
    const batch = createBatch([createEnvelope()])
    const presentation = createAttackPresentation(
      batch,
      [createPlan([warning])]
    )
    const display = presentation.combos[0].damagePresentation

    expect(Object.isFrozen(display)).toBe(true)
    expect(Object.isFrozen(display.warnings)).toBe(true)
    expect(Object.isFrozen(display.warnings[0].details)).toBe(false)
    expect(JSON.parse(JSON.stringify(display))).toEqual(display)
    expect(JSON.parse(JSON.stringify(
      presentation.totalDamagePresentation
    ))).toEqual(presentation.totalDamagePresentation)
  })

  it('rejects plan count mismatch and invalid batch shape with typed errors', () => {
    const batch = createBatch([createEnvelope()])

    expect(() => createAttackPresentation(batch, [])).toThrow(
      AttackPresentationError
    )
    try {
      createAttackPresentation(batch, [])
    } catch (error) {
      expect(isAttackPresentationError(error)).toBe(true)
      expect(error.code).toBe(
        ATTACK_PRESENTATION_ERROR_CODES.RANGE_PLAN_COUNT_MISMATCH
      )
    }

    expect(() => createAttackPresentation(null, [])).toThrow(
      AttackPresentationError
    )
    expect(() => createAttackPresentation({
      combos: [],
      totalDamage: batch.totalDamage,
    }, [])).toThrow(
      expect.objectContaining({
        code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT,
      })
    )
    expect(() => createAttackPresentation({
      combos: [{}],
      totalDamage: batch.totalDamage,
      totalDamageStatistics: batch.totalDamageStatistics,
    }, [createPlan()])).toThrow(
      expect.objectContaining({
        code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO,
      })
    )
  })

  it('rejects malformed summaries through the typed distribution presenter error', () => {
    const batch = createBatch([createEnvelope()])
    const malformed = {
      ...batch,
      combos: [{
        ...batch.combos[0],
        damageStatistics: {},
      }],
    }

    expect(() => createAttackPresentation(malformed, [createPlan()]))
      .toThrow(DistributionPresentationError)
  })

  it('returns immutable presentation containers while retaining calculation ownership', () => {
    const batch = createBatch([createEnvelope()])
    const plan = createPlan([], {
      scores: [{ tail: { bound: 0.01 } }],
    })
    const presentation = createAttackPresentation(batch, [plan])
    const combo = presentation.combos[0]

    expect(Object.isFrozen(presentation)).toBe(true)
    expect(Object.isFrozen(presentation.combos)).toBe(true)
    expect(Object.isFrozen(combo)).toBe(true)
    expect(Object.isFrozen(combo.score)).toBe(false)
    expect(Object.isFrozen(combo.score.action)).toBe(false)
    expect(Object.isFrozen(combo.score.action.distribution)).toBe(false)
    expect(Object.isFrozen(combo.scoreStatistics)).toBe(false)
    expect(Object.isFrozen(combo.scoreStatistics.action)).toBe(false)
    expect(Object.isFrozen(combo.rangePlan)).toBe(true)
    expect(Object.isFrozen(combo.rangePlan.scores)).toBe(false)
    expect(Object.isFrozen(combo.rangePlan.scores[0])).toBe(false)
    expect(Object.isFrozen(combo.rangePlan.scores[0].tail)).toBe(false)
    expect(Object.isFrozen(combo.rangePlan.warnings)).toBe(true)
  })
})
