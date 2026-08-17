import { describe, expect, it } from 'vitest'

import {
  createCanonicalLegacyAttackDisplay,
  CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS,
  CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS,
} from '../src/application/CanonicalLegacyAttackDisplay'
import { createDistributionResult } from '../src/calculation/DistributionResult'

function createEnvelope({
  values = [0.25, 0.75],
  offset = 0,
  support = { kind: 'finite', max: 1 },
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

function createScore(seed = 0.25) {
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

function createAttackData(options = {}) {
  const firstDamage = options.firstDamage ?? createEnvelope()
  const secondDamage = options.secondDamage ?? createEnvelope({
    values: [0.5, 0.5],
  })
  const totalDamage = options.totalDamage ?? createEnvelope({
    values: [0.5, 0.5],
  })
  const combos = [
    {
      id: 'first',
      name: '一段目',
      data: {
        score: createScore(),
        scoreSummary: {
          action: { expectedValue: 4.1, successRate: 80 },
          reaction: { expectedValue: 3.2, successRate: 20 },
        },
        canonicalDamage: firstDamage,
        canonicalDamageSummary: {
          expectedValue: options.firstExpectedValue
            ?? { kind: 'exact', value: 0.75 },
        },
        canonicalDamagePresentation: null,
        canonicalResultReady: true,
      },
    },
    {
      id: 'second',
      name: '二段目',
      data: {
        score: createScore(0.4),
        scoreSummary: {
          action: { expectedValue: 5.1, successRate: 70 },
          reaction: { expectedValue: 2.2, successRate: 30 },
        },
        canonicalDamage: secondDamage,
        canonicalDamageSummary: {
          expectedValue: options.secondExpectedValue
            ?? { kind: 'exact', value: 0.5 },
        },
        canonicalDamagePresentation: null,
        canonicalResultReady: true,
      },
    },
  ]

  return {
    canonicalOptIn: options.canonicalOptIn ?? true,
    canonicalTotalDamageReady: options.canonicalTotalDamageReady ?? true,
    canonicalTotalDamage: totalDamage,
    canonicalTotalDamageSummary: {
      expectedValue: options.totalExpectedValue
        ?? { kind: 'exact', value: 0.5 },
    },
    canonicalTotalDamagePresentation: null,
    combos,
  }
}

describe('createCanonicalLegacyAttackDisplay', () => {
  it('projects exact finite combos and total with legacy summary rounding', () => {
    const attackData = createAttackData()
    const originalScore = attackData.combos[0].data.score
    const originalScoreSummary = attackData.combos[0].data.scoreSummary
    const originalValues = Array.from(
      attackData.combos[0].data.canonicalDamage.result.values
    )

    const result = createCanonicalLegacyAttackDisplay(attackData)

    expect(result.kind).toBe('projected')
    expect(result.displayAttackData.combos.map((combo) => [combo.id, combo.name]))
      .toEqual([
        ['first', '一段目'],
        ['second', '二段目'],
      ])
    expect(result.displayAttackData.combos[0].data.damage.distribution)
      .toHaveLength(1024)
    expect(result.displayAttackData.combos[0].data.damage.distribution)
      .toEqual(expect.arrayContaining([0.25, 0.75]))
    expect(result.displayAttackData.combos[0].data.damage.upperTailProbability)
      .toHaveLength(1024)
    expect(result.displayAttackData.combos[0].data.damageSummary.expectedValue)
      .toBe(0.8)
    expect(result.displayAttackData.combos[1].data.damageSummary.expectedValue)
      .toBe(0.5)
    expect(result.displayAttackData.totalDamage.distribution).toHaveLength(1024)
    expect(result.displayAttackData.totalDamageSummary.expectedValue).toBe(0.5)
    expect(result.displayAttackData.combos[0].data.score).toEqual(originalScore)
    expect(result.displayAttackData.combos[0].data.score).not.toBe(originalScore)
    expect(result.displayAttackData.combos[0].data.scoreSummary)
      .toEqual(originalScoreSummary)
    expect(result.displayAttackData.combos[0].data.scoreSummary)
      .not.toBe(originalScoreSummary)
    expect(Array.from(
      attackData.combos[0].data.canonicalDamage.result.values
    )).toEqual(originalValues)
    expect(result.displayAttackData.combos[0].data.damage.distribution)
      .not.toBe(attackData.combos[0].data.canonicalDamage.result.values)
  })

  it('returns not-ready and leaves the caller on a legacy fallback path', () => {
    const disabled = createCanonicalLegacyAttackDisplay(
      createAttackData({ canonicalOptIn: false })
    )
    expect(disabled).toMatchObject({
      kind: 'not-ready',
      reason: CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.OPT_IN_DISABLED,
    })

    const totalNotReady = createCanonicalLegacyAttackDisplay(
      createAttackData({ canonicalTotalDamageReady: false })
    )
    expect(totalNotReady).toMatchObject({
      kind: 'not-ready',
      reason: CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.TOTAL_NOT_READY,
    })

    const comboNotReadyData = createAttackData()
    comboNotReadyData.combos[1].data.canonicalResultReady = false
    const comboNotReady = createCanonicalLegacyAttackDisplay(comboNotReadyData)
    expect(comboNotReady).toMatchObject({
      kind: 'not-ready',
      reason: CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.COMBO_NOT_READY,
      comboId: 'second',
    })
  })

  it('does not project upper-bound or unsafe exact overflow', () => {
    const upperBound = createCanonicalLegacyAttackDisplay(createAttackData({
      firstDamage: createEnvelope({
        support: { kind: 'infinite' },
        overflow: {
          kind: 'upper-bound',
          lowerBound: 1023,
          probabilityUpperBound: 0.2,
          errorBound: 0,
        },
      }),
    }))
    expect(upperBound).toMatchObject({
      kind: 'not-projectable',
      reason: 'upper-bound-overflow',
      scope: 'combo',
      comboId: 'first',
    })

    const unsafeExact = createCanonicalLegacyAttackDisplay(createAttackData({
      firstDamage: createEnvelope({
        support: { kind: 'infinite' },
        overflow: {
          kind: 'exact',
          lowerBound: 1000,
          probability: 0.2,
          errorBound: 0,
        },
        values: [0.8],
      }),
    }))
    expect(unsafeExact).toMatchObject({
      kind: 'not-projectable',
      reason: 'unsafe-exact-overflow',
      scope: 'combo',
      comboId: 'first',
    })
  })

  it('does not collapse bounded or lower-bound expected values to points', () => {
    const bounded = createCanonicalLegacyAttackDisplay(createAttackData({
      firstExpectedValue: { kind: 'bounded', lowerBound: 1, upperBound: 2 },
    }))
    expect(bounded).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.BOUNDED_EXPECTED_VALUE,
      comboId: 'first',
    })

    const lowerBound = createCanonicalLegacyAttackDisplay(createAttackData({
      totalExpectedValue: { kind: 'lower-bound', lowerBound: 1 },
    }))
    expect(lowerBound).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.LOWER_BOUND_EXPECTED_VALUE,
      scope: 'total',
    })
  })
})
