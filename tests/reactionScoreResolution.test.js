import { describe, expect, it } from 'vitest'

import {
  deriveEvasionScoreValue,
  normalizeAttackCalculationInput,
  normalizeReactionResolution,
} from '../src/domain/CalculationInputNormalization'
import {
  createDefenceInputSnapshot,
} from '../src/features/attack/model/AttackInputSnapshot'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import {
  calculateScoreResolution,
} from '../src/calculation/ScoreCalculator'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'

const damage = { dice: 0, value: 0 }

function rolledScore(overrides = {}) {
  return {
    dice: 1,
    critical: 10,
    skill: 0,
    yousei: 0,
    shihai: 0,
    ...overrides,
  }
}

function attackWithReaction(reaction) {
  return {
    operation: 'attack',
    score: {
      action: rolledScore(),
      reaction,
    },
    attack: { dice: 0, value: 0, kazanari: 0 },
    defence: damage,
  }
}

describe('reaction score resolution', () => {
  it('keeps raw Evasion coordinates in the feature snapshot', () => {
    const snapshot = createDefenceInputSnapshot({
      mode: '《イベイジョン》',
      score: { dice: 3, critical: 9, skill: 4, yousei: 1, shihai: 1 },
      damage,
    })

    expect(snapshot.score).toEqual({
      dice: 3,
      critical: 9,
      skill: 4,
      yousei: 1,
      shihai: 1,
    })
  })

  it('normalizes each reaction mode to an explicit resolution', () => {
    expect(normalizeReactionResolution({
      mode: 'ドッジ',
      score: rolledScore(),
      damage,
    }).score).toEqual({
      kind: 'rolled-score',
      params: rolledScore(),
    })
    expect(normalizeReactionResolution({
      mode: '《イベイジョン》',
      score: { dice: 3, skill: 4 },
      damage,
    }).score).toEqual({ kind: 'fixed-score', value: 10 })
    expect(normalizeReactionResolution({
      mode: 'ガード・リアクション放棄',
      score: rolledScore({ dice: 99 }),
      damage,
    }).score).toEqual({ kind: 'forced-failure' })
  })

  it('uses exact integer arithmetic for Evasion derivation', () => {
    expect(deriveEvasionScoreValue(
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
    )).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => deriveEvasionScoreValue(
      Number.MAX_SAFE_INTEGER,
      0,
    )).toThrow(/safe integer/)
    expect(deriveEvasionScoreValue(0, -7)).toBe(0)
  })

  it('normalizes action and reaction independently without losing raw mode', () => {
    const normalized = normalizeAttackCalculationInput({
      action: { score: rolledScore(), damage: { ...damage, kazanari: 0 } },
      reaction: {
        mode: '《イベイジョン》',
        score: { dice: 3, skill: 4 },
        damage,
      },
    })

    expect(normalized.action.score.kind).toBe('rolled-score')
    expect(normalized.reaction.mode).toBe('《イベイジョン》')
    expect(normalized.reaction.score).toEqual({
      kind: 'fixed-score',
      value: 10,
    })
  })
})

describe('resolution-aware score planning and production', () => {
  it('plans Evasion as a sparse fixed score', () => {
    const plan = planCalculationRanges(attackWithReaction({
      kind: 'fixed-score',
      value: Number.MAX_SAFE_INTEGER,
    }))
    const reaction = plan.scores[1]

    expect(reaction.kind).toBe('fixed-score')
    expect(reaction.value).toBe(Number.MAX_SAFE_INTEGER)
    expect(reaction.outputMax).toBe(Number.MAX_SAFE_INTEGER)
    expect(reaction.support).toMatchObject({
      kind: 'finite-support',
      min: Number.MAX_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    })
    expect(reaction.operations).toBe(0)
    expect(reaction.fftOperations).toBe(0)
    expect(reaction).not.toHaveProperty('workingLength')
    expect(reaction).not.toHaveProperty('fftLength')
    expect(plan.damage.scoreValueUpperBound).toBe(plan.scores[0].outputMax)
  })

  it('plans Guard as an exact forced failure without DX compatibility checks', () => {
    const plan = planCalculationRanges(attackWithReaction({
      kind: 'forced-failure',
    }))
    const reaction = plan.scores[1]

    expect(plan.accepted).toBe(true)
    expect(reaction.kind).toBe('forced-failure')
    expect(reaction.outputMax).toBe(0)
    expect(reaction.operations).toBe(0)
    expect(reaction.fftOperations).toBe(0)
    expect(reaction).not.toHaveProperty('workingLength')
  })

  it('produces deterministic envelopes with matching finite certificates', () => {
    const fixedPlan = planCalculationRanges({
      operation: 'score',
      score: { kind: 'fixed-score', value: 10 },
    }).scores[0]
    const fixed = calculateScoreResolution(
      { kind: 'fixed-score', value: 10 },
      {},
      fixedPlan,
    )
    expect(fixed.result).toMatchObject({
      offset: 10,
      support: { kind: 'finite', max: 10 },
      overflow: null,
    })
    expect(Array.from(fixed.result.values)).toEqual([1])
    expect(fixed.metadata.forcedFailureProbability).toBe(0)
    expect(fixed.metadata.scoreTailMomentCertificate).toMatchObject({
      model: 'finite-support',
      modeledMax: 10,
      massUpperBound: 0,
    })

    const forcedPlan = planCalculationRanges({
      operation: 'score',
      score: { kind: 'forced-failure' },
    }).scores[0]
    const forced = calculateScoreResolution(
      { kind: 'forced-failure' },
      {},
      forcedPlan,
    )
    expect(forced.result.offset).toBe(0)
    expect(forced.metadata.forcedFailureProbability).toBe(1)
  })

  it('rejects a resolution/plan kind mismatch', () => {
    const rolledPlan = planCalculationRanges({
      operation: 'score',
      score: rolledScore(),
    }).scores[0]
    expect(() => calculateScoreResolution(
      { kind: 'fixed-score', value: 10 },
      {},
      rolledPlan,
    )).toThrow(/does not match plan kind/)
    expect(() => calculateScoreResolution(
      { kind: 'fixed-score', value: 10 },
      {},
      { value: 10 },
    )).toThrow(/does not match plan kind/)
  })

  it('accepts a terminal MAX_SAFE one-point distribution only', () => {
    expect(createDistributionResult({
      values: [1],
      offset: Number.MAX_SAFE_INTEGER,
      support: { kind: 'finite', max: Number.MAX_SAFE_INTEGER },
      overflow: null,
    }).offset).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => createDistributionResult({
      values: [1, 0],
      offset: Number.MAX_SAFE_INTEGER,
      support: { kind: 'finite', max: Number.MAX_SAFE_INTEGER },
      overflow: null,
    })).toThrow()
  })
})
