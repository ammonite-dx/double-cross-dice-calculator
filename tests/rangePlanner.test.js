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

function createOneDieOracle(critical, maxValue) {
  const distribution = Array(maxValue + 1).fill(0)
  const criticalProbability = (11 - critical) / 10
  for (let remainder = 1; remainder < critical; remainder += 1) {
    let value = remainder
    let probability = 0.1
    while (value <= maxValue) {
      distribution[value] += probability
      value += 10
      probability *= criticalProbability
    }
  }

  const total = distribution.reduce((sum, probability) => sum + probability, 0)
  distribution[maxValue] += 1 - total
  return distribution
}

function createFiniteYouseiOracle({ dice, critical, yousei }, maxValue = 1000) {
  if (dice === 0) {
    const result = Array(maxValue + 1).fill(0)
    result[0] = 1
    return result
  }

  const oneDie = createOneDieOracle(critical, maxValue)
  const result = Array(maxValue + 1).fill(0)
  let cumulative = 0
  let previousMaxCumulative = 0
  for (let value = 0; value <= maxValue; value += 1) {
    cumulative += oneDie[value]
    const maxCumulative = cumulative ** dice
    result[value] = maxCumulative - previousMaxCumulative
    previousMaxCumulative = maxCumulative
  }

  let current = result
  for (let count = 0; count < yousei; count += 1) {
    const rounded = Array(maxValue + 1).fill(0)
    for (let value = 0; value <= maxValue; value += 1) {
      const target = value === 0
        ? 0
        : Math.min(maxValue, Math.ceil(value / 10) * 10)
      rounded[target] += current[value]
    }

    const next = Array(maxValue + 1).fill(0)
    for (let left = 0; left <= maxValue; left += 1) {
      if (rounded[left] === 0) {
        continue
      }
      for (let right = 0; right <= maxValue; right += 1) {
        if (oneDie[right] === 0) {
          continue
        }
        next[Math.min(maxValue, left + right)] +=
          rounded[left] * oneDie[right]
      }
    }
    current = next
  }
  return current
}

function finiteOracleTail(distribution, value) {
  const cutoff = Math.floor(value)
  let result = 0
  for (
    let index = Math.max(0, cutoff + 1);
    index < distribution.length;
    index += 1
  ) {
    result += distribution[index]
  }
  return Math.max(0, Math.min(1, result))
}

function defendedOverflowLowerBound(damage, overflowLowerBound) {
  // For a>=0, workingMax is already in the X+a coordinate. For a<0, it is
  // still in the X coordinate and the fixed difference is applied afterward.
  const postDefenceShift = damage.fixedDifference < 0
    ? damage.fixedDifference
    : 0
  return overflowLowerBound - damage.defenceMax + postDefenceShift
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

  it('plans check action and reaction scores within the shared tail budget', () => {
    const plan = planCalculationRanges({
      operation: 'check',
      score: {
        action: scoreParams({ dice: 20, critical: 2 }),
        reaction: scoreParams({ dice: 10, critical: 7 }),
      },
    })

    expect(plan.operation).toBe('check')
    expect(plan.damage).toBeNull()
    expect(plan.backtrack).toBeNull()
    expect(plan.scores).toHaveLength(2)
    expect(plan.scores[0].tail.requested).toBe(4e-9)
    expect(plan.scores[1].tail.requested).toBe(4e-9)
    expect(plan.errorBudget.scoreTail).toBe(8e-9)
    expect(plan.errorBudget.scorePerSide).toBe(4e-9)
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
    expect(yousei.scores[0].tail.model).toBe('exact-yousei')
    expect(incompatible.accepted).toBe(false)
    expect(incompatible.scores[0].tail.model).toBe('conservative-union-bound')
    expect(incompatible.rejectionReasons).toContain('incompatible-input')
    expect(
      incompatible.warnings.find(
        (warning) => warning.code === 'incompatible-input'
      ).severity
    ).toBe('reject')
  })

  it('matches a finite round-and-convolution oracle for small yousei cases', () => {
    const cases = [
      { dice: 1, critical: 2, shihai: 0, yousei: 1 },
      { dice: 2, critical: 3, shihai: 0, yousei: 2 },
      { dice: 3, critical: 7, shihai: 0, yousei: 1 },
    ]

    for (const params of cases) {
      const oracle = createFiniteYouseiOracle(params)
      for (let value = 0; value <= 220; value += 1) {
        expect(scoreTailBound(value, params)).toBeCloseTo(
          finiteOracleTail(oracle, value),
          10,
        )
      }
    }
  })

  it('keeps ten-boundary, critical-11, zero-dice, and one-use cases exact', () => {
    const oneUse = { dice: 1, critical: 11, shihai: 0, yousei: 1 }
    expect(scoreTailBound(10, oneUse)).toBe(1)
    expect(scoreTailBound(11, oneUse)).toBeCloseTo(0.9)
    expect(scoreTailBound(19, oneUse)).toBeCloseTo(0.1)
    expect(scoreTailBound(20, oneUse)).toBe(0)

    const twoUses = { dice: 1, critical: 11, shihai: 0, yousei: 2 }
    expect(scoreTailBound(20, twoUses)).toBe(1)
    expect(scoreTailBound(21, twoUses)).toBeCloseTo(0.9)
    expect(scoreTailBound(30, twoUses)).toBe(0)

    const zeroDice = { dice: 0, critical: 2, shihai: 0, yousei: 9 }
    expect(scoreTailBound(0, zeroDice)).toBe(0)
    expect(findTailCutoff(zeroDice, 1e-8)).toEqual({
      reachable: true,
      cutoff: 0,
      bound: 0,
    })

    for (const critical of [1, 12, 2.5]) {
      expect(() => scoreTailBound(0, {
        dice: 0,
        critical,
        shihai: 0,
        yousei: 1,
      })).toThrow(RangeError)
    }

    expect(() => scoreTailBound(Number.NaN, oneUse)).toThrow(RangeError)
    expect(scoreTailBound(Number.POSITIVE_INFINITY, oneUse)).toBe(0)
    expect(scoreTailBound(Number.NEGATIVE_INFINITY, oneUse)).toBe(1)
  })

  it('uses the exact yousei certificate for the stress case below the hard range', () => {
    const cutoffParams = {
      dice: 99,
      critical: 2,
      shihai: 0,
      yousei: 9,
    }
    const cutoff = findTailCutoff(cutoffParams, 1e-8)
    expect(cutoff.bound).toBeLessThanOrEqual(1e-8)
    expect(
      scoreTailBound(cutoff.cutoff - 1, cutoffParams)
    ).toBeGreaterThan(1e-8)

    const plan = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ dice: 99, critical: 2, yousei: 9 }),
    }))
    const score = plan.scores[0]

    expect(plan.accepted).toBe(true)
    expect(score.tail.model).toBe('exact-yousei')
    expect(score.workingLength).toBeLessThan(16384)
    expect(score.tail.bound).toBeLessThanOrEqual(1e-8)
  })

  it('plans the same FFT length used by score convolution', () => {
    const plan = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ dice: 99, critical: 2, yousei: 9 }),
    }))
    const score = plan.scores[0]

    expect(score.fftLength).toBe(nextPowerOfTwo(
      2 * score.workingLength - 1
    ))
  })

  it('keeps exact-yousei tails finite, non-negative, and monotone at larger inputs', () => {
    const cases = [
      { dice: 300, critical: 2, shihai: 0, yousei: 30 },
      { dice: 500, critical: 5, shihai: 0, yousei: 40 },
    ]

    for (const params of cases) {
      let previous = scoreTailBound(0, params)
      for (let value = 37; value <= 12000; value += 37) {
        const current = scoreTailBound(value, params)
        expect(Number.isFinite(current)).toBe(true)
        expect(current).toBeGreaterThanOrEqual(0)
        expect(current).toBeLessThanOrEqual(1)
        expect(current).toBeLessThanOrEqual(previous + 1e-12)
        previous = current
      }
    }
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
    expect(positive.damage.workingLength).toBe(217)
    expect(negative.damage.fixedDifference).toBe(-5)
    expect(negative.damage.workingMax).toBe(210)
    expect(negative.damage.workingLength).toBe(212)
    expect(positive.damage.defenceFftLength).toBe(
      nextPowerOfTwo(positive.damage.workingLength + positive.damage.defenceMax)
    )
  })

  it('keeps the pre-defence overflow above calculationMax after defence', () => {
    const policy = {
      calculationMax: 200,
      display: { defaultMax: 0 },
    }
    const cases = [
      {
        label: 'positive difference',
        attack: { dice: 30, value: 5, kazanari: 0 },
        defence: { dice: 2, value: 0 },
        expectedDifference: 5,
        expectedWorkingMax: 220,
      },
      {
        label: 'zero difference',
        attack: { dice: 30, value: 0, kazanari: 0 },
        defence: { dice: 2, value: 0 },
        expectedDifference: 0,
        expectedWorkingMax: 220,
      },
      {
        label: 'negative difference with defence',
        attack: { dice: 30, value: 0, kazanari: 0 },
        defence: { dice: 2, value: 5 },
        expectedDifference: -5,
        expectedWorkingMax: 225,
      },
      {
        label: 'negative difference without defence',
        attack: { dice: 30, value: 0, kazanari: 0 },
        defence: { dice: 0, value: 5 },
        expectedDifference: -5,
        expectedWorkingMax: 205,
      },
    ]

    for (const testCase of cases) {
      const plan = planCalculationRanges(attackParams({
        attack: testCase.attack,
        defence: testCase.defence,
        display: { min: 0, max: 0 },
      }), policy)
      const damage = plan.damage
      const overflowLowerBound = damage.workingMax + 1

      expect(plan.overflowInfo.damage.lowerBound, testCase.label).toBe(
        overflowLowerBound
      )
      expect(damage.fixedDifference, testCase.label).toBe(
        testCase.expectedDifference
      )
      expect(damage.workingMax, testCase.label).toBe(
        testCase.expectedWorkingMax
      )
      expect(damage.workingLength, testCase.label).toBe(
        testCase.expectedWorkingMax + 2
      )
      expect(overflowLowerBound, testCase.label).toBe(
        testCase.expectedWorkingMax + 1
      )

      expect(
        defendedOverflowLowerBound(damage, overflowLowerBound),
        testCase.label
      ).toBe(201)
      if (damage.defenceDice > 0) {
        expect(damage.defenceFftLength, testCase.label).toBe(
          nextPowerOfTwo(damage.workingLength + damage.defenceMax)
        )
      } else {
        expect(damage.defenceFftLength, testCase.label).toBe(0)
      }
    }

    const exactPowerOfTwo = planCalculationRanges(attackParams({
      attack: { dice: 30, value: 0, kazanari: 0 },
      defence: { dice: 2, value: 0 },
      display: { min: 0, max: 0 },
    }), {
      calculationMax: 214,
      display: { defaultMax: 0 },
    }).damage
    expect(exactPowerOfTwo.workingMax).toBe(234)
    expect(exactPowerOfTwo.workingLength).toBe(236)
    expect(exactPowerOfTwo.defenceFftLength).toBe(256)
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
