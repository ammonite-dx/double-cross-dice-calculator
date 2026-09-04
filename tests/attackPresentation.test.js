import { describe, expect, it } from 'vitest'

import {
  ATTACK_PRESENTATION_ERROR_CODES,
  AttackPresentationError,
  createAttackPresentation,
  isAttackPresentationError,
} from '../src/features/attack/model/AttackPresentation'
import {
  DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH,
  DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
  DistributionPresentationError,
} from '../src/shared/presentation'
import {
  createDistributionResult,
  getTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import { getDamageSummary } from '../src/calculation/DamageCalculator'
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
    scoreSummary: {
      action: { expectedValue: index + 1 },
      reaction: { expectedValue: index + 2 },
    },
    damage,
    damageSummary: getDamageSummary(damage),
    ...(options.legacyFields ? {
      canonicalDamage: { distribution: ['retired'] },
      canonicalDamageSummary: { expectedValue: 'retired' },
    } : {}),
  }))
  const totalDamage = sumDamage(damages)
  return {
    combos,
    totalDamage,
    totalDamageSummary:
      getTotalDamageSummary(totalDamage),
  }
}

function createPlan(warnings = [], extra = {}) {
  return {
    operation: 'attack',
    ...extra,
    warnings,
  }
}

function batchWithComboOverride(batch, override) {
  return {
    ...batch,
    combos: [{ ...batch.combos[0], ...override }],
  }
}

function revokedProxy(value = {}) {
  const { proxy, revoke } = Proxy.revocable(value, {})
  revoke()
  return proxy
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
    expect(presentation.combos[0].damageSummary)
      .toBe(batch.combos[0].damageSummary)
    expect(presentation.totalDamage).toBe(batch.totalDamage)
    expect(presentation.totalDamageSummary)
      .toBe(batch.totalDamageSummary)
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
    const summary = batch.combos[0].damageSummary
    const totalSummary = batch.totalDamageSummary
    const presentation = createAttackPresentation(
      batch,
      [createPlan()]
    )

    expect(presentation.combos[0].damageSummary).toBe(summary)
    expect(presentation.combos[0].damagePresentation.expectedValue)
      .toEqual(expected)
    expect(presentation.totalDamageSummary).toBe(totalSummary)
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
      totalDamageSummary:
        getTotalDamageSummary(totalDamage),
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

  it('does not mutate input or retain mutable combo/plan object aliases', () => {
    const damage = createEnvelope()
    const batch = createBatch([damage], { legacyFields: true })
    const plan = createPlan([], {
      scores: [{ tail: { bound: 0.01 } }],
    })
    const scoreBefore = JSON.parse(JSON.stringify(batch.combos[0].score))
    const summaryBefore = JSON.parse(JSON.stringify(batch.combos[0].scoreSummary))
    const planBefore = JSON.parse(JSON.stringify(plan))

    const presentation = createAttackPresentation(batch, [plan])

    expect(presentation.combos).not.toBe(batch.combos)
    expect(presentation.combos[0]).not.toBe(batch.combos[0])
    expect(presentation.combos[0].score).not.toBe(batch.combos[0].score)
    expect(presentation.combos[0].scoreSummary)
      .not.toBe(batch.combos[0].scoreSummary)
    expect(presentation.combos[0].rangePlan).not.toBe(plan)
    expect(presentation.combos[0].damage).toBe(damage)
    expect(presentation.combos[0].damageSummary)
      .toBe(batch.combos[0].damageSummary)
    expect(presentation.combos[0]).not.toHaveProperty('canonicalDamage')
    expect(presentation.combos[0]).not.toHaveProperty('canonicalDamageSummary')
    expect(batch.combos[0]).not.toHaveProperty('damagePresentation')

    expect(batch.combos[0].score).toEqual(JSON.parse(JSON.stringify(scoreBefore)))
    expect(batch.combos[0].scoreSummary)
      .toEqual(JSON.parse(JSON.stringify(summaryBefore)))
    expect(plan).toEqual(JSON.parse(JSON.stringify(planBefore)))
  })

  it('keeps presenter freeze and JSON round-trip guarantees', () => {
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
    expect(Object.isFrozen(display.warnings[0].details)).toBe(true)
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
        code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_SUMMARY,
      })
    )
    expect(() => createAttackPresentation({
      combos: [{}],
      totalDamage: batch.totalDamage,
      totalDamageSummary: batch.totalDamageSummary,
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
        damageSummary: {},
      }],
    }

    expect(() => createAttackPresentation(malformed, [createPlan()]))
      .toThrow(DistributionPresentationError)
  })

  it('converts revoked proxy reflection failures into field-specific typed errors', () => {
    const batch = createBatch([createEnvelope()])

    expect(() => createAttackPresentation(revokedProxy(), []))
      .toThrow(expect.objectContaining({
        code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT,
      }))
    expect(() => createAttackPresentation({
      ...batch,
      combos: revokedProxy([]),
    }, [])).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_BATCH_RESULT,
    }))
    expect(() => createAttackPresentation(batch, revokedProxy([])))
      .toThrow(expect.objectContaining({
        code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_RANGE_PLANS,
      }))
    expect(() => createAttackPresentation(
      batchWithComboOverride(batch, { score: revokedProxy() }),
      [createPlan()]
    )).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO,
    }))
  })

  it('rejects accessors without executing getters', () => {
    const batch = createBatch([createEnvelope()])
    let comboGetterCalled = false
    const combo = { ...batch.combos[0] }
    Object.defineProperty(combo, 'score', {
      configurable: true,
      enumerable: true,
      get() {
        comboGetterCalled = true
        throw new Error('combo getter must not run')
      },
    })

    expect(() => createAttackPresentation({
      ...batch,
      combos: [combo],
    }, [createPlan()])).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_COMBO,
    }))
    expect(comboGetterCalled).toBe(false)

    let nestedGetterCalled = false
    const score = {}
    Object.defineProperty(score, 'action', {
      configurable: true,
      enumerable: true,
      get() {
        nestedGetterCalled = true
        throw new Error('nested getter must not run')
      },
    })
    expect(() => createAttackPresentation(
      batchWithComboOverride(batch, { score }),
      [createPlan()]
    )).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.INVALID_CLONE,
    }))
    expect(nestedGetterCalled).toBe(false)
  })

  it.each([
    ['function', () => {}],
    ['symbol', Symbol('unsafe')],
    ['bigint', 1n],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['Date', new Date(0)],
    ['Map', new Map()],
    ['Set', new Set()],
    ['class instance', new (class UnknownValue {})()],
  ])('rejects unsafe clone values: %s', (_label, value) => {
    const batch = createBatch([createEnvelope()])

    expect(() => createAttackPresentation(
      batchWithComboOverride(batch, { score: { value } }),
      [createPlan()]
    )).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
    }))
  })

  it('rejects cycles and clone depth/node limit violations', () => {
    const batch = createBatch([createEnvelope()])
    const cycle = {}
    cycle.self = cycle
    expect(() => createAttackPresentation(
      batchWithComboOverride(batch, { score: cycle }),
      [createPlan()]
    )).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
    }))

    let deep = { leaf: true }
    for (let index = 0; index <= DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH; index += 1) {
      deep = { next: deep }
    }
    expect(() => createAttackPresentation(
      batchWithComboOverride(batch, { score: { deep } }),
      [createPlan()]
    )).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
    }))

    const manyValues = Array.from(
      { length: DISTRIBUTION_PRESENTATION_MAX_JSON_NODES },
      () => 0
    )
    expect(() => createAttackPresentation(
      batchWithComboOverride(batch, { score: { manyValues } }),
      [createPlan()]
    )).toThrow(expect.objectContaining({
      code: ATTACK_PRESENTATION_ERROR_CODES.UNSAFE_CLONE,
    }))
  })

  it('defensively clones ArrayBuffer, DataView, and typed-array score values', () => {
    const buffer = new ArrayBuffer(8)
    const bytes = new Uint8Array(buffer)
    bytes.set([1, 2, 3, 4, 5, 6, 7, 8])
    const typed = new Uint16Array(buffer)
    const dataView = new DataView(buffer, 2, 4)
    const batch = createBatch([createEnvelope()])
    const inputScore = { buffer, typed, dataView }

    const presentation = createAttackPresentation(
      batchWithComboOverride(batch, { score: inputScore }),
      [createPlan()]
    )
    const outputScore = presentation.combos[0].score

    expect(outputScore.buffer).not.toBe(buffer)
    expect(outputScore.typed).not.toBe(typed)
    expect(outputScore.dataView).not.toBe(dataView)
    expect(Array.from(new Uint8Array(outputScore.buffer)))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(Array.from(outputScore.typed)).toEqual(Array.from(typed))
    expect(Array.from(new Uint8Array(
      outputScore.dataView.buffer,
      outputScore.dataView.byteOffset,
      outputScore.dataView.byteLength
    ))).toEqual([3, 4, 5, 6])

    bytes[0] = 99
    expect(new Uint8Array(outputScore.buffer)[0]).toBe(1)
  })

  it('returns an atomic deeply frozen payload for mutable nested fields', () => {
    const batch = createBatch([createEnvelope()])
    const plan = createPlan([], {
      scores: [{ tail: { bound: 0.01 } }],
    })
    const presentation = createAttackPresentation(batch, [plan])
    const combo = presentation.combos[0]

    expect(Object.isFrozen(presentation)).toBe(true)
    expect(Object.isFrozen(presentation.combos)).toBe(true)
    expect(Object.isFrozen(combo)).toBe(true)
    expect(Object.isFrozen(combo.score)).toBe(true)
    expect(Object.isFrozen(combo.score.action)).toBe(true)
    expect(Object.isFrozen(combo.score.action.distribution)).toBe(true)
    expect(Object.isFrozen(combo.scoreSummary)).toBe(true)
    expect(Object.isFrozen(combo.scoreSummary.action)).toBe(true)
    expect(Object.isFrozen(combo.rangePlan)).toBe(true)
    expect(Object.isFrozen(combo.rangePlan.scores)).toBe(true)
    expect(Object.isFrozen(combo.rangePlan.scores[0])).toBe(true)
    expect(Object.isFrozen(combo.rangePlan.scores[0].tail)).toBe(true)
    expect(Object.isFrozen(combo.rangePlan.warnings)).toBe(true)
  })
})
