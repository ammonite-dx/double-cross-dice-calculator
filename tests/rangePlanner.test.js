import { describe, expect, it } from 'vitest'

import {
  findTailCutoff,
  nextPowerOfTwo,
  planCalculationRanges,
  scoreTailBound,
} from '../src/calculation/RangePlanner'

function scoreParams(overrides = {}) {
  return {
    dice: 0,
    critical: 11,
    shihai: 0,
    yousei: 0,
    skill: 0,
    ...overrides,
  }
}

function scoreOnlyParams(overrides = {}) {
  return {
    operation: 'score',
    score: scoreParams(),
    ...overrides,
  }
}

function attackParams(overrides = {}) {
  return {
    operation: 'attack',
    score: {
      action: scoreParams(),
      reaction: scoreParams(),
    },
    attack: { dice: 0, value: 0, kazanari: 0 },
    defence: { dice: 0, value: 0 },
    ...overrides,
  }
}

describe('production range planner', () => {
  it('finds a cutoff boundary and preserves tail monotonicity', () => {
    const params = { dice: 99, critical: 2, shihai: 0, yousei: 0 }
    const epsilon = 1e-8
    const cutoff = findTailCutoff(params, epsilon)

    expect(cutoff.reachable).toBe(true)
    expect(cutoff.bound).toBeLessThanOrEqual(epsilon)
    expect(scoreTailBound(cutoff.cutoff - 1, params)).toBeGreaterThan(epsilon)

    let previous = scoreTailBound(0, params)
    for (let value = 1; value <= cutoff.cutoff; value += 1) {
      const current = scoreTailBound(value, params)
      expect(current).toBeLessThanOrEqual(previous + 1e-12)
      previous = current
    }
  })

  it('keeps zero dice and critical 11 at an exact zero-tail cutoff', () => {
    const plan = planCalculationRanges(scoreOnlyParams())
    const score = plan.scores[0]

    expect(plan.accepted).toBe(true)
    expect(score.tail.model).toBe('exact-max')
    expect(score.tail.cutoff).toBe(0)
    expect(score.tail.bound).toBe(0)
    expect(score.finiteSupport).toBe(false)
    expect(plan.overflowInfo.score.type).toBe('dx-tail')
    expect(plan.overflowInfo.score.lowerBound).toBe(1023)
  })

  it('summarizes multiple DX tail certificates without a shared boundary', () => {
    const plan = planCalculationRanges(attackParams({
      score: {
        action: scoreParams({ dice: 99, critical: 2 }),
        reaction: scoreParams({ dice: 0, critical: 11, skill: 50 }),
      },
    }))
    const summary = plan.overflowInfo.score

    expect(summary.lowerBound).toBeNull()
    expect(summary.bound).toBeCloseTo(
      plan.scores.reduce((sum, score) => sum + score.tail.bound, 0)
    )
    expect(summary.meaning).toContain('multiple scores')
  })

  it('distinguishes shihai and yousei tail models and rejects their combination', () => {
    const shihai = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ dice: 10, critical: 2, shihai: 1 }),
    }))
    const yousei = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ dice: 10, critical: 2, yousei: 1 }),
    }))
    const incompatible = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ dice: 10, critical: 2, shihai: 1, yousei: 1 }),
    }))

    expect(shihai.scores[0].tail.model).toBe('conservative-max-bound')
    expect(yousei.scores[0].tail.model).toBe('conservative-union-bound')
    expect(incompatible.accepted).toBe(false)
    expect(incompatible.rejectionReasons).toContain('incompatible-input')
    expect(
      incompatible.warnings.find(
        (warning) => warning.code === 'incompatible-input'
      ).severity
    ).toBe('reject')
  })

  it('adjusts the working range in the expected direction for skill shifts', () => {
    const positiveSkill = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ skill: 10 }),
    }))
    const negativeSkill = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ skill: -10 }),
    }))

    expect(positiveSkill.scores[0].workingMax).toBe(1012)
    expect(negativeSkill.scores[0].workingMax).toBe(1032)
    expect(positiveSkill.scores[0].outputMax).toBe(1022)
    expect(negativeSkill.scores[0].outputMax).toBe(1022)
  })

  it('plans finite DR support and a separate defence-convolution FFT', () => {
    const plan = planCalculationRanges(attackParams({
      attack: { dice: 10, value: 0, kazanari: 0 },
      defence: { dice: 10, value: 0 },
    }))
    const damage = plan.damage
    const requiredDefenceConvolution = damage.workingLength + damage.defenceMax

    expect(damage.finiteSupport).toBe(true)
    expect(damage.rawSupportMax).toBe(1130)
    expect(damage.fftLength).toBe(nextPowerOfTwo(damage.rawSupportMax + 1))
    expect(damage.defenceFftLength).toBe(
      nextPowerOfTwo(requiredDefenceConvolution)
    )
    expect(damage.defenceFftLength).toBeGreaterThanOrEqual(
      requiredDefenceConvolution
    )
    expect(plan.overflowInfo.damage.type).toBe('finite-support')
  })

  it('keeps both signs of fixed attack-defence differences in range planning', () => {
    const policy = {
      calculationMax: 200,
      display: { defaultMax: 0 },
    }
    const positive = planCalculationRanges(attackParams({
      attack: { dice: 0, value: 5, kazanari: 0 },
      defence: { dice: 2, value: 0 },
      display: { min: 0, max: 0 },
    }), policy)
    const negative = planCalculationRanges(attackParams({
      attack: { dice: 0, value: 0, kazanari: 0 },
      defence: { dice: 2, value: 5 },
      display: { min: 0, max: 0 },
    }), policy)

    expect(positive.damage.fixedDifference).toBe(5)
    expect(positive.damage.workingMax).toBe(215)
    expect(negative.damage.fixedDifference).toBe(-5)
    expect(negative.damage.workingMax).toBe(205)
    expect(positive.damage.defenceFftLength).toBe(
      nextPowerOfTwo(positive.damage.workingLength + positive.damage.defenceMax)
    )
  })

  it('uses exact display and resource warning/hard boundaries', () => {
    const exactDisplay = planCalculationRanges(scoreOnlyParams({
      display: { min: 0, max: 999 },
    }))
    const tooManyDisplayPoints = planCalculationRanges(scoreOnlyParams({
      display: { min: 0, max: 1000 },
    }))
    const costModel = {
      dxOperationsPerMs: 1,
      fftOperationsPerMs: 1,
      damageOperationsPerMs: 1,
      backtrackOperationsPerMs: 1,
    }
    const baseline = planCalculationRanges(
      scoreOnlyParams({ score: scoreParams({ critical: 2 }) }),
      { costModel }
    )
    const time = baseline.estimates.timeMs
    const exact = planCalculationRanges(
      scoreOnlyParams({ score: scoreParams({ critical: 2 }) }),
      {
        costModel,
        limits: {
          warning: { estimatedTimeMs: time },
          hard: { estimatedTimeMs: time },
        },
      }
    )
    const warning = planCalculationRanges(
      scoreOnlyParams({ score: scoreParams({ critical: 2 }) }),
      {
        costModel,
        limits: {
          warning: { estimatedTimeMs: time - 1 },
          hard: { estimatedTimeMs: time + 1 },
        },
      }
    )
    const hard = planCalculationRanges(
      scoreOnlyParams({ score: scoreParams({ critical: 2 }) }),
      {
        costModel,
        limits: {
          warning: { estimatedTimeMs: time - 1 },
          hard: { estimatedTimeMs: time - 0.5 },
        },
      }
    )

    expect(exactDisplay.accepted).toBe(true)
    expect(exactDisplay.display.points).toBe(1000)
    expect(tooManyDisplayPoints.accepted).toBe(false)
    expect(tooManyDisplayPoints.rejectionReasons).toContain('display-points')
    expect(exact.accepted).toBe(true)
    expect(exact.warnings.some((warning) => warning.code === 'estimated-time')).toBe(false)
    expect(warning.accepted).toBe(true)
    expect(warning.warnings.find((item) => item.code === 'estimated-time').severity).toBe('warning')
    expect(hard.accepted).toBe(false)
    expect(hard.rejectionReasons).toContain('estimated-time')
  })

  it('separates DX/DR body cost from FFT cost', () => {
    const scoreParamsForTest = scoreOnlyParams({
      score: scoreParams({ dice: 10, critical: 2, yousei: 1 }),
    })
    const common = {
      dxOperationsPerMs: 1_000_000,
      damageOperationsPerMs: 1_000_000,
      backtrackOperationsPerMs: 1_000_000,
    }
    const slowerFft = planCalculationRanges(scoreParamsForTest, {
      costModel: { ...common, fftOperationsPerMs: 1_000_000 },
    })
    const fasterFft = planCalculationRanges(scoreParamsForTest, {
      costModel: { ...common, fftOperationsPerMs: 2_000_000 },
    })

    expect(slowerFft.estimates.scoreFftOperations).toBeGreaterThan(0)
    expect(fasterFft.estimates.timeMs).toBeLessThan(slowerFft.estimates.timeMs)
    expect(fasterFft.estimates.dxTimeMs).toBe(slowerFft.estimates.dxTimeMs)
  })

  it('keeps published-bucket as the default and exposes full-tail as a plan-only option', () => {
    const params = attackParams({
      score: {
        action: scoreParams({ dice: 200, critical: 2, skill: 500 }),
        reaction: scoreParams({ dice: 99, critical: 8 }),
      },
      attack: { dice: 150, value: 500, kazanari: 0 },
      defence: { dice: 99, value: -500 },
    })
    const published = planCalculationRanges(params)
    const fullTail = planCalculationRanges(params, {
      scorePropagation: 'full-tail',
    })

    expect(published.damage.scoreValueMode).toBe('published-bucket')
    expect(fullTail.damage.scoreValueMode).toBe('full-tail')
    expect(published.damage.maxDamageDice).toBe(253)
    expect(fullTail.damage.maxDamageDice).toBe(434)
    expect(fullTail.damage.scoreValueUpperBound).toBeGreaterThan(
      published.damage.scoreValueUpperBound
    )
  })

  it('clamps negative backtrack dice and reports finite asset overflow', () => {
    const clamped = planCalculationRanges({
      operation: 'backtrack',
      backtrack: {
        lois: 0,
        elois: 0,
        dice: 0,
        value: 0,
        dlois: '戦闘用人格・生きる伝説',
      },
    })
    const overflow = planCalculationRanges({
      operation: 'backtrack',
      backtrack: {
        lois: 100,
        elois: 0,
        dice: 0,
        value: 0,
        dlois: 'なし',
      },
    })

    expect(clamped.backtrack.diceCounts).toEqual({
      single: 0,
      double: 0,
      second: 0,
    })
    expect(clamped.backtrack.finiteSupport).toBe(true)
    expect(overflow.backtrack.rawSupportMax).toBe(3000)
    expect(overflow.backtrack.assetOverflow).toBe(true)
    expect(overflow.warnings.find(
      (warning) => warning.code === 'backtrack-asset-overflow'
    ).severity).toBe('warning')
    expect(overflow.overflowInfo.backtrack.type).toBe('asset')
  })

  it('rejects malformed planner and policy inputs', () => {
    expect(() => planCalculationRanges(null)).toThrow(TypeError)
    expect(() => planCalculationRanges({ operation: 'unknown' })).toThrow(RangeError)
    expect(() => planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ critical: 1 }),
    }))).toThrow(RangeError)
    expect(() => planCalculationRanges(attackParams({
      attack: { dice: -1, value: 0, kazanari: 0 },
    }))).toThrow(RangeError)
    expect(() => planCalculationRanges(scoreOnlyParams({
      display: { min: 10, max: 9 },
    }))).toThrow(RangeError)
    expect(() => planCalculationRanges(scoreOnlyParams(), {
      scorePropagation: 'unknown',
    })).toThrow(RangeError)
    expect(() => planCalculationRanges(scoreOnlyParams(), {
      costModel: { fftOperationsPerMs: 0 },
    })).toThrow(RangeError)
    expect(() => planCalculationRanges(scoreOnlyParams(), {
      errorBudget: { total: 1e-8, scoreTail: 2e-8 },
    })).toThrow(RangeError)
    expect(() => planCalculationRanges(scoreOnlyParams({ comboCount: 0 }))).toThrow(RangeError)
    expect(() => findTailCutoff(scoreParams(), 0)).toThrow(RangeError)
  })
})
