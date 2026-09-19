import { describe, expect, it } from 'vitest'

import {
  normalizeAttackCalculationInput,
  normalizeAttackDamageInput,
  normalizeBacktrackParams,
  normalizeDefenceDamageInput,
  normalizeDifficultyInput,
  normalizeReactionResolution,
  normalizeScoreInput,
} from '../src/domain/CalculationInputNormalization'
import {
  INPUT_DOMAIN,
  isSupportedScoreFeatureCombination,
} from '../src/domain/InputDomain'

describe('calculation input normalization', () => {
  it('normalizes score defaults without applying feature compatibility', () => {
    expect(normalizeScoreInput({ dice: 1, critical: 10 })).toEqual({
      dice: 1,
      critical: 10,
      skill: 0,
      yousei: 0,
      shihai: 0,
    })
    expect(normalizeScoreInput({
      dice: 1,
      critical: 10,
      yousei: 1,
      shihai: 1,
    })).toEqual(expect.objectContaining({ yousei: 1, shihai: 1 }))
  })

  it('rejects invalid score values while retaining the finite domain constants', () => {
    expect(() => normalizeScoreInput({ dice: -1, critical: 10 })).toThrow()
    expect(() => normalizeScoreInput({ dice: 1, critical: 1 })).toThrow()
    expect(() => normalizeScoreInput({ dice: 1, critical: 10, skill: 1.5 }))
      .toThrow()
    expect(INPUT_DOMAIN.critical).toEqual({ min: 2, max: 11 })
  })

  it('exposes a non-throwing score feature compatibility predicate', () => {
    expect(isSupportedScoreFeatureCombination({ yousei: 1, shihai: 0 }))
      .toBe(true)
    expect(isSupportedScoreFeatureCombination({ yousei: 1, shihai: 1 }))
      .toBe(false)
    expect(isSupportedScoreFeatureCombination({ yousei: '1' }))
      .toBe(false)
  })

  it('preserves omitted difficulty defaults while requiring strict values', () => {
    expect(normalizeDifficultyInput()).toEqual({ opposed: false, target: 0 })
    expect(normalizeDifficultyInput({})).toEqual({ opposed: false, target: 0 })
    expect(normalizeDifficultyInput({ opposed: false, target: 10 }))
      .toEqual({ opposed: false, target: 10 })
    expect(() => normalizeDifficultyInput({ opposed: 'false', target: 10 }))
      .toThrow()
    expect(() => normalizeDifficultyInput({ opposed: null, target: 10 }))
      .toThrow()
    expect(() => normalizeDifficultyInput({ opposed: false, target: -1 }))
      .toThrow()
    expect(() => normalizeDifficultyInput({
      opposed: false,
      target: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow()
  })

  it('normalizes attack and defence damage coordinates', () => {
    expect(normalizeAttackDamageInput({ dice: 2, value: -3 }))
      .toEqual({ dice: 2, value: -3, kazanari: 0 })
    expect(normalizeDefenceDamageInput({ dice: 2, value: -3 }))
      .toEqual({ dice: 2, value: -3 })
    expect(() => normalizeAttackDamageInput({ dice: -1, value: 0 }))
      .toThrow()
    expect(() => normalizeDefenceDamageInput({ dice: 1, value: 1.5 }))
      .toThrow()
  })

  it('normalizes all reaction modes', () => {
    const damage = { dice: 1, value: 2 }
    expect(normalizeReactionResolution({
      mode: 'ドッジ',
      score: { dice: 1, critical: 9, skill: 2 },
      damage,
    })).toEqual({
      mode: 'ドッジ',
      score: {
        kind: 'rolled-score',
        params: { dice: 1, critical: 9, skill: 2, yousei: 0, shihai: 0 },
      },
      damage,
    })
    expect(normalizeReactionResolution({
      mode: '《イベイジョン》',
      score: { dice: 3, skill: 4 },
      damage,
    })).toEqual({
      mode: '《イベイジョン》',
      score: { kind: 'fixed-score', value: 10 },
      damage,
    })
    expect(normalizeReactionResolution({
      mode: 'ガード・リアクション放棄',
      score: { dice: 99, skill: 999 },
      damage,
    })).toEqual({
      mode: 'ガード・リアクション放棄',
      score: { kind: 'forced-failure' },
      damage,
    })
    expect(() => normalizeReactionResolution({ mode: 'unknown', score: {}, damage }))
      .toThrow()
  })

  it('normalizes backtrack defaults and the remaining Lois domain', () => {
    expect(normalizeBacktrackParams()).toEqual({
      encroachment: 0,
      lois: 0,
      elois: 0,
      dice: 0,
      value: 0,
      dlois: 'なし',
    })
    expect(normalizeBacktrackParams({ lois: 0 })).toMatchObject({ lois: 0 })
    expect(normalizeBacktrackParams({ lois: 7 })).toMatchObject({ lois: 7 })
    expect(() => normalizeBacktrackParams({ lois: 8 })).toThrow()
    expect(() => normalizeBacktrackParams({ lois: -1 })).toThrow()
    expect(() => normalizeBacktrackParams({ value: -1 })).toThrow()
  })

  it('composes canonical action and reaction input', () => {
    const normalized = normalizeAttackCalculationInput({
      action: {
        score: { dice: 1, critical: 10 },
        damage: { dice: 2, value: 3 },
      },
      reaction: {
        mode: 'ガード・リアクション放棄',
        score: { dice: 1, critical: 10 },
        damage: { dice: 0, value: 4 },
      },
    })
    expect(normalized.action).toEqual({
      score: {
        kind: 'rolled-score',
        params: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      },
      damage: { dice: 2, value: 3, kazanari: 0 },
    })
    expect(normalized.reaction.score).toEqual({
      kind: 'forced-failure',
    })
  })
})
