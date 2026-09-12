import { describe, expect, it, vi } from 'vitest'

import {
  calculateDamageOnDemand,
  getDamageStatistics,
} from '../src/calculation/DamageCalculator'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import { calculateScore } from '../src/calculation/ScoreCalculator'
import { createDistributionResult } from '../src/calculation/DistributionResult'

function scoreEnvelope(entries, options = {}) {
  const maxValue = Math.max(...entries.map(([value]) => value))
  const values = new Float64Array(maxValue + 1)
  for (const [value, probability] of entries) {
    values[value] = probability
  }
  return {
    result: createDistributionResult({
      values,
      support: options.support ?? { kind: 'finite', max: maxValue },
      overflow: options.overflow ?? null,
    }),
    metadata: {
      modeledDistribution: true,
      ...options.metadata,
    },
  }
}

function finiteScoreEnvelope(value) {
  return scoreEnvelope([[value, 1]], {
    metadata: {
      scoreTailCertificate: {
        version: 1,
        kind: 'score-tail-certificate',
        massLowerBound: 0,
        massUpperBound: 0,
        lowerBound: null,
        probabilityErrorBound: 0,
      },
      scoreTailMomentCertificate: {
        version: 1,
        kind: 'score-tail-moment-certificate',
        model: 'finite-support',
        modeledMax: value,
        massUpperBound: 0,
        firstMomentUpperBound: 0,
        numericalErrorBound: 0,
      },
    },
  })
}

function pointDamageProvider(rawValue = 0) {
  return vi.fn(async (weights, _kazanari, options) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const result = new Float64Array(options.distributionLength)
    result[Math.min(rawValue, result.length - 1)] = total
    return result
  })
}

function zeroDefenceProvider(_dice, size) {
  const result = new Float64Array(size)
  result[0] = 1
  return result
}

function calculateScoreForPlan(params, plan) {
  return calculateScore(
    params,
    {
      getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
        calculateDxDistribution(
          { shihai, dice, critical, yousei },
          options
        ),
    },
    plan
  )
}

function createFullTailContext({
  actionScore,
  reactionScore,
  attack = { dice: 0, value: 0, kazanari: 0 },
  defence = { dice: 0, value: 0 },
}) {
  const rangePlan = planCalculationRanges({
    operation: 'attack',
    score: {
      action: actionScore,
      reaction: reactionScore,
    },
    attack,
    defence,
  }, { scorePropagation: 'full-tail' })
  const score = {
    action: calculateScoreForPlan(actionScore, rangePlan.scores[0]),
    reaction: calculateScoreForPlan(reactionScore, rangePlan.scores[1]),
  }
  return { attack, defence, rangePlan, score }
}

describe('Damage expected-value certificate', () => {
  it('keeps finite no-tail Damage on the generic exact path', async () => {
    const attack = { dice: 1, value: 2, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const score = {
      action: scoreEnvelope([[5, 1]]),
      reaction: scoreEnvelope([[0, 1]]),
    }
    const plan = {
      accepted: true,
      operation: 'attack',
      propagation: { score: 'full-tail' },
      scores: [
        { tail: { kind: 'finite-support', bound: 0, modeledMax: 5 } },
        { tail: { kind: 'finite-support', bound: 0, modeledMax: 0 } },
      ],
      damage: {
        fixedDifference: 2,
        rawSupportMax: 20,
        rawMax: 20,
        workingMax: 22,
        workingLength: 24,
        defenceMax: 0,
        fftLength: 32,
        defenceFftLength: 0,
        scoreValueMode: 'full-tail',
        maxDamageDice: 2,
      },
    }
    const result = await calculateDamageOnDemand(
      score,
      attack,
      defence,
      { getDamageRollDistribution: pointDamageProvider(0) },
      {},
      plan
    )

    expect(result.metadata.damageExpectationCertificate).toBeNull()
    expect(getDamageStatistics(result).expectedValue.kind).toBe('exact')
  })

  it('certifies ordinary full-tail Damage and restores the public default display value', async () => {
    const actionScore = {
      dice: 1,
      critical: 10,
      shihai: 0,
      yousei: 0,
      skill: 0,
    }
    const reactionScore = { ...actionScore }
    const context = createFullTailContext({ actionScore, reactionScore })
    const damage = await calculateDamageOnDemand(
      context.score,
      context.attack,
      context.defence,
      { getDamageRollDistribution: pointDamageProvider(5) },
      {},
      context.rangePlan
    )
    const certificate = damage.metadata.damageExpectationCertificate
    const statistics = getDamageStatistics(damage)

    expect(certificate).toEqual(expect.objectContaining({
      version: 1,
      kind: 'damage-expectation-certificate',
      actionTailContributionUpperBound: expect.any(Number),
      reactionTailContributionUpperBound: expect.any(Number),
      numericalErrorBound: expect.any(Number),
    }))
    expect(statistics.expectedValue.kind).toBe('bounded')
    expect(statistics.expectedValue.lowerBound)
      .toBeLessThanOrEqual(statistics.expectedValue.upperBound)
    expect(statistics.expectedValue.upperBound - statistics.expectedValue.lowerBound)
      .toBeLessThan(0.05)
  })

  it('uses reaction tail mass without requiring a reaction moment certificate', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const plan = {
      accepted: true,
      operation: 'attack',
      propagation: { score: 'full-tail' },
      scores: [
        { tail: { kind: 'dx-tail', bound: 0, modeledMax: 5 } },
        { tail: { kind: 'dx-tail', bound: 0.4, modeledMax: 1 } },
      ],
      damage: {
        fixedDifference: 0,
        rawSupportMax: 10,
        rawMax: 10,
        workingMax: 10,
        workingLength: 12,
        defenceMax: 0,
        fftLength: 16,
        defenceFftLength: 0,
        scoreValueMode: 'full-tail',
        maxDamageDice: 1,
      },
    }
    const score = {
      action: scoreEnvelope([[5, 1]], {
        metadata: {
          scoreTailCertificate: {
            version: 1,
            kind: 'score-tail-certificate',
            massLowerBound: 0,
            massUpperBound: 0,
            lowerBound: null,
            probabilityErrorBound: 0,
          },
          scoreTailMomentCertificate: {
            version: 1,
            kind: 'score-tail-moment-certificate',
            model: 'finite-support',
            modeledMax: 5,
            massUpperBound: 0,
            firstMomentUpperBound: 0,
            numericalErrorBound: 0,
          },
        },
      }),
      reaction: scoreEnvelope([[0, 0.6]], {
        support: { kind: 'infinite' },
        overflow: {
          kind: 'exact',
          lowerBound: 10,
          probability: 0.4,
          errorBound: 0,
        },
        metadata: {
          scoreTailCertificate: {
            version: 1,
            kind: 'score-tail-certificate',
            massLowerBound: 0.4,
            massUpperBound: 0.4,
            lowerBound: 10,
            probabilityErrorBound: 0,
          },
        },
      }),
    }

    const damage = await calculateDamageOnDemand(
      score,
      attack,
      { dice: 0, value: 0 },
      { getDamageRollDistribution: pointDamageProvider(0) },
      {},
      plan
    )

    expect(damage.metadata.damageExpectationCertificate)
      .toEqual(expect.objectContaining({
        actionTailContributionUpperBound: 0,
        reactionTailContributionUpperBound: 0,
      }))
    expect(getDamageStatistics(damage).expectedValue.kind).toBe('bounded')
  })

  it('bounds an action tail with its moment plus the universal damage constant', async () => {
    const attack = { dice: 1, value: 2, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const plan = {
      accepted: true,
      operation: 'attack',
      propagation: { score: 'full-tail' },
      scores: [
        { tail: { kind: 'dx-tail', bound: 0.1, modeledMax: 5 } },
        { tail: { kind: 'finite-support', bound: 0, modeledMax: 0 } },
      ],
      damage: {
        fixedDifference: 2,
        rawSupportMax: 20,
        rawMax: 20,
        workingMax: 22,
        workingLength: 24,
        defenceMax: 0,
        fftLength: 32,
        defenceFftLength: 0,
        scoreValueMode: 'full-tail',
        maxDamageDice: 2,
      },
    }
    const action = scoreEnvelope([[5, 0.9]], {
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 6,
        probabilityUpperBound: 0.1,
        errorBound: 0,
      },
      metadata: {
        scoreTailCertificate: {
          version: 1,
          kind: 'score-tail-certificate',
          massLowerBound: 0,
          massUpperBound: 0.1,
          lowerBound: 6,
          probabilityErrorBound: 0,
        },
        scoreTailMomentCertificate: {
          version: 1,
          kind: 'score-tail-moment-certificate',
          model: 'synthetic',
          modeledMax: 5,
          massUpperBound: 0.1,
          firstMomentUpperBound: 4,
          numericalErrorBound: 0,
        },
      },
    })
    const damage = await calculateDamageOnDemand(
      {
        action,
        reaction: finiteScoreEnvelope(0),
      },
      attack,
      defence,
      { getDamageRollDistribution: pointDamageProvider(0) },
      {},
      plan
    )

    const certificate = damage.metadata.damageExpectationCertificate
    expect(certificate).not.toBeNull()
    expect(certificate.maxDamageConstant).toBe(22)
    expect(certificate.actionTailContributionUpperBound).toBeCloseTo(6.2, 12)
    expect(certificate.reactionTailContributionUpperBound).toBe(0)
  })

  it('adds only the reaction explicit-by-tail contribution when the tail can win', async () => {
    const attack = { dice: 2, value: 3, kazanari: 0 }
    const defence = { dice: 0, value: 5 }
    const plan = {
      accepted: true,
      operation: 'attack',
      propagation: { score: 'full-tail' },
      scores: [
        { tail: { kind: 'finite-support', bound: 0, modeledMax: 5 } },
        { tail: { kind: 'dx-tail', bound: 0.2, modeledMax: 0 } },
      ],
      damage: {
        fixedDifference: -2,
        rawSupportMax: 30,
        rawMax: 30,
        workingMax: 30,
        workingLength: 32,
        defenceMax: 0,
        fftLength: 32,
        defenceFftLength: 0,
        scoreValueMode: 'full-tail',
        maxDamageDice: 3,
      },
    }
    const action = finiteScoreEnvelope(5)
    const reaction = scoreEnvelope([[0, 0.8]], {
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1,
        probabilityUpperBound: 0.2,
        errorBound: 0,
      },
      metadata: {
        scoreTailCertificate: {
          version: 1,
          kind: 'score-tail-certificate',
          massLowerBound: 0,
          massUpperBound: 0.2,
          lowerBound: 1,
          probabilityErrorBound: 0,
        },
      },
    })
    const damage = await calculateDamageOnDemand(
      { action, reaction },
      attack,
      defence,
      { getDamageRollDistribution: pointDamageProvider(0) },
      {},
      plan
    )

    const certificate = damage.metadata.damageExpectationCertificate
    expect(certificate).not.toBeNull()
    expect(certificate.maxDamageConstant).toBe(30)
    expect(certificate.actionTailContributionUpperBound).toBe(0)
    expect(certificate.reactionTailContributionUpperBound).toBeCloseTo(7, 12)
  })

  it('does not double-count the action-tail by reaction-tail event', async () => {
    const attack = { dice: 1, value: 4, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const plan = {
      accepted: true,
      operation: 'attack',
      propagation: { score: 'full-tail' },
      scores: [
        { tail: { kind: 'dx-tail', bound: 0.1, modeledMax: 5 } },
        { tail: { kind: 'dx-tail', bound: 0.2, modeledMax: 0 } },
      ],
      damage: {
        fixedDifference: 4,
        rawSupportMax: 20,
        rawMax: 20,
        workingMax: 24,
        workingLength: 26,
        defenceMax: 0,
        fftLength: 32,
        defenceFftLength: 0,
        scoreValueMode: 'full-tail',
        maxDamageDice: 2,
      },
    }
    const action = scoreEnvelope([[5, 0.9]], {
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 6,
        probabilityUpperBound: 0.1,
        errorBound: 0,
      },
      metadata: {
        scoreTailCertificate: {
          version: 1,
          kind: 'score-tail-certificate',
          massLowerBound: 0,
          massUpperBound: 0.1,
          lowerBound: 6,
          probabilityErrorBound: 0,
        },
        scoreTailMomentCertificate: {
          version: 1,
          kind: 'score-tail-moment-certificate',
          model: 'synthetic',
          modeledMax: 5,
          massUpperBound: 0.1,
          firstMomentUpperBound: 4,
          numericalErrorBound: 0,
        },
      },
    })
    const reaction = scoreEnvelope([[0, 0.8]], {
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1,
        probabilityUpperBound: 0.2,
        errorBound: 0,
      },
      metadata: {
        scoreTailCertificate: {
          version: 1,
          kind: 'score-tail-certificate',
          massLowerBound: 0,
          massUpperBound: 0.2,
          lowerBound: 1,
          probabilityErrorBound: 0,
        },
      },
    })
    const damage = await calculateDamageOnDemand(
      { action, reaction },
      attack,
      defence,
      { getDamageRollDistribution: pointDamageProvider(0) },
      {},
      plan
    )

    const certificate = damage.metadata.damageExpectationCertificate
    expect(certificate).not.toBeNull()
    expect(certificate.actionTailContributionUpperBound).toBeCloseTo(6.4, 12)
    expect(certificate.reactionTailContributionUpperBound).toBeCloseTo(5.8, 12)
    expect(certificate.actionTailMassUpperBound).toBe(0.1)
    expect(certificate.reactionTailMassUpperBound).toBe(0.2)
  })

  it.each([
    {
      name: 'Kazanari',
      attack: { dice: 2, value: 0, kazanari: 1 },
      defence: { dice: 0, value: 0 },
    },
    {
      name: 'defence dice',
      attack: { dice: 1, value: 2, kazanari: 0 },
      defence: { dice: 1, value: 0 },
    },
    {
      name: 'positive fixed difference',
      attack: { dice: 1, value: 5, kazanari: 0 },
      defence: { dice: 0, value: 0 },
    },
    {
      name: 'negative fixed difference',
      attack: { dice: 1, value: 0, kazanari: 0 },
      defence: { dice: 1, value: 5 },
    },
  ])('certifies $name without changing the universal constant', async ({ attack, defence }) => {
    const context = createFullTailContext({
      actionScore: { dice: 1, critical: 10, shihai: 0, yousei: 0, skill: 0 },
      reactionScore: { dice: 1, critical: 10, shihai: 0, yousei: 0, skill: 0 },
      attack,
      defence,
    })
    const damage = await calculateDamageOnDemand(
      context.score,
      context.attack,
      context.defence,
      {
        getDamageRollDistribution: pointDamageProvider(20),
        getD10Distribution: zeroDefenceProvider,
      },
      {},
      context.rangePlan
    )
    const certificate = damage.metadata.damageExpectationCertificate

    expect(certificate).not.toBeNull()
    expect(certificate.maxDamageConstant).toBe(
      10 * (1 + attack.dice)
        + Math.max(0, attack.value - defence.value)
    )
  })

  it('uses reaction Yousei tail mass without requiring its first moment', async () => {
    const context = createFullTailContext({
      actionScore: { dice: 1, critical: 10, shihai: 0, yousei: 0, skill: 0 },
      reactionScore: { dice: 1, critical: 10, shihai: 0, yousei: 1, skill: 0 },
    })
    const damage = await calculateDamageOnDemand(
      context.score,
      context.attack,
      context.defence,
      { getDamageRollDistribution: pointDamageProvider(5) },
      {},
      context.rangePlan
    )

    expect(context.score.reaction.metadata.scoreTailMomentCertificate)
      .toBeNull()
    expect(damage.metadata.damageExpectationCertificate).not.toBeNull()
  })

  it('fails closed when the action Yousei moment is unavailable', async () => {
    const context = createFullTailContext({
      actionScore: { dice: 1, critical: 10, shihai: 0, yousei: 1, skill: 0 },
      reactionScore: { dice: 1, critical: 10, shihai: 0, yousei: 0, skill: 0 },
    })
    const damage = await calculateDamageOnDemand(
      context.score,
      context.attack,
      context.defence,
      { getDamageRollDistribution: pointDamageProvider(5) },
      {},
      context.rangePlan
    )

    expect(context.score.action.metadata.scoreTailMomentCertificate)
      .toBeNull()
    expect(damage.metadata.damageExpectationCertificate).toBeNull()
    expect(getDamageStatistics(damage).expectedValue.kind)
      .toBe('lower-bound')
  })

  it('falls back to the generic lower bound for an invalid dedicated certificate', () => {
    const result = createDistributionResult({
      values: [0.5],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1,
        probabilityUpperBound: 0.5,
        errorBound: 0,
      },
    })
    const damage = {
      result,
      metadata: {
        modeledDistribution: true,
        damageExpectationCertificate: {
          version: 999,
          kind: 'damage-expectation-certificate',
          lowerBound: 0,
          upperBound: 1,
          numericalErrorBound: 0,
        },
      },
    }

    expect(getDamageStatistics(damage).expectedValue).toEqual({
      kind: 'lower-bound',
      lowerBound: 0,
    })
  })
})
