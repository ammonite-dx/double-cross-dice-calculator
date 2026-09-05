import { describe, expect, it } from 'vitest'

import {
  DEFAULT_POLICY,
  planCalculationRanges,
} from '../src/calculation/RangePlanner'
import { nextPowerOfTwo } from '../src/calculation/planning/PlanningMath'
import {
  findTailCutoff,
  maxTailFirstMomentUpperBound,
  scoreTailBound,
} from '../src/calculation/DxTailModel'
import { OUTPUT_DISTRIBUTION_SIZE } from '../src/core/probability/Distribution'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  D10_MAX_GENERATION_OPERATIONS,
  getD10GenerationOperationEstimate,
  getD10RequiredLength,
} from '../src/calculation/D10Calculator'

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

const PERMISSIVE_LIMITS = {
  warning: {
    estimatedTimeMs: Number.MAX_SAFE_INTEGER,
    estimatedMemoryBytes: Number.MAX_SAFE_INTEGER,
    workingLength: Number.MAX_SAFE_INTEGER,
    fftLength: Number.MAX_SAFE_INTEGER,
  },
  hard: {
    estimatedTimeMs: Number.MAX_SAFE_INTEGER,
    estimatedMemoryBytes: Number.MAX_SAFE_INTEGER,
    workingLength: Number.MAX_SAFE_INTEGER,
    fftLength: Number.MAX_SAFE_INTEGER,
  },
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

  it('bounds the DX first-moment residual with a ten-residue geometric tail', () => {
    const cases = [
      { dice: 1, critical: 10, cutoff: 20 },
      { dice: 7, critical: 5, cutoff: 80 },
      { dice: 20, critical: 2, cutoff: 200 },
    ]

    for (const params of cases) {
      const bound = maxTailFirstMomentUpperBound(
        params.cutoff,
        params.dice,
        params.critical
      )
      const extended = maxTailFirstMomentUpperBound(
        params.cutoff + 10,
        params.dice,
        params.critical
      )

      expect(Number.isFinite(bound)).toBe(true)
      expect(bound).toBeGreaterThanOrEqual(0)
      expect(extended).toBeLessThanOrEqual(bound + 1e-12)
    }

    expect(maxTailFirstMomentUpperBound(0, 1, 11))
      .toBeCloseTo(4.5, 12)
    expect(maxTailFirstMomentUpperBound(100, 0, 10)).toBe(0)
  })

  it('contains a long finite simulation of the first-moment residual', () => {
    const cutoff = 40
    const params = { dice: 3, critical: 5, shihai: 0 }
    const distribution = calculateDxDistribution(params, {
      workingLength: 4098,
      rounding: 'unrounded',
    })
    let simulatedResidual = 0
    for (let value = cutoff + 2; value < distribution.length - 1; value += 1) {
      simulatedResidual += (value - cutoff - 1) * distribution[value]
    }

    const bound = maxTailFirstMomentUpperBound(
      cutoff,
      params.dice,
      params.critical
    )
    expect(simulatedResidual).toBeLessThanOrEqual(bound + 1e-12)
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

  it('models the deterministic shihai shortcut without a dice-sized DP table', () => {
    const plan = planCalculationRanges(scoreOnlyParams({
      score: scoreParams({ dice: 100_000, critical: 2, shihai: 100_000 }),
    }), { limits: PERMISSIVE_LIMITS })
    const score = plan.scores[0]

    expect(plan.accepted).toBe(true)
    expect(score.operations).toBe(0)
    expect(score.float64Bytes).toBe(
      2 * score.workingLength * Float64Array.BYTES_PER_ELEMENT
    )
    expect(score.float64Bytes).toBeLessThan(100_000 * score.workingLength)
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
    expect(scoreTailBound(9, oneUse)).toBe(1)
    expect(scoreTailBound(10, oneUse)).toBe(0)
    expect(scoreTailBound(11, oneUse)).toBe(0)
    expect(scoreTailBound(20, oneUse)).toBe(0)

    const twoUses = { dice: 1, critical: 11, shihai: 0, yousei: 2 }
    expect(scoreTailBound(9, twoUses)).toBe(1)
    expect(scoreTailBound(10, twoUses)).toBe(0)
    expect(scoreTailBound(21, twoUses)).toBe(0)
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
      2 * score.dxBlockLength - 1
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
    expect(positive.damage.workingMax).toBe(220)
    expect(positive.damage.workingLength).toBe(222)
    expect(negative.damage.fixedDifference).toBe(-5)
    expect(negative.damage.workingMax).toBe(225)
    expect(negative.damage.workingLength).toBe(227)
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
    expect(tooManyDisplayPoints.accepted).toBe(true)
    expect(tooManyDisplayPoints.display.points).toBe(1001)
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

  it.each([
    {
      label: 'critical and skill shifts at zero/max dice boundaries',
      score: {
        action: scoreParams({ dice: 0, critical: 11, skill: -50 }),
        reaction: scoreParams({ dice: 99, critical: 2, skill: 75 }),
      },
      attack: { dice: 0, value: 0, kazanari: 0 },
      defence: { dice: 0, value: 0 },
    },
    {
      label: 'yousei with maximum attack and defence dice',
      score: {
        action: scoreParams({ dice: 99, critical: 2, yousei: 9 }),
        reaction: scoreParams({ dice: 1, critical: 8, skill: -20 }),
      },
      attack: { dice: 99, value: 5, kazanari: 9 },
      defence: { dice: 99, value: -5 },
    },
    {
      label: 'shihai on the reaction score',
      score: {
        action: scoreParams({ dice: 1, critical: 10 }),
        reaction: scoreParams({ dice: 99, critical: 2, skill: 30, shihai: 9 }),
      },
      attack: { dice: 1, value: 5, kazanari: 1 },
      defence: { dice: 1, value: 0 },
    },
  ])(
    'derives the full-tail damage range from the action canonical score plan ($label)',
    ({ score, attack, defence }) => {
      const plan = planCalculationRanges(attackParams({
        score,
        attack,
        defence,
      }), {
        scorePropagation: 'full-tail',
        limits: PERMISSIVE_LIMITS,
      })
      const damage = plan.damage
      const scoreValueUpperBound = plan.scores[0].outputMax
      const maxDamageDice =
        Math.floor(scoreValueUpperBound / 10) + 1 + attack.dice
      const rawSupportMax = 10 * maxDamageDice
      const fixedDifference = attack.value - defence.value
      const defenceMax = defence.dice * 10
      const workingMax = fixedDifference >= 0
        ? Math.max(
            0,
            Math.min(
              rawSupportMax + fixedDifference,
              damage.calculationMax + defenceMax
            )
          )
        : Math.max(
            0,
            Math.min(
              rawSupportMax,
              damage.calculationMax - fixedDifference + defenceMax
            )
          )
      const workingLength = workingMax + 2
      const fftLength = nextPowerOfTwo(rawSupportMax + 1)
      const defenceFftLength = defence.dice > 0
        ? nextPowerOfTwo(workingLength + defenceMax)
        : 0
      const operations =
        (fftLength / 2 + 1) *
        (maxDamageDice + 1) *
        (1 + 15 * Math.log1p(attack.kazanari))
      const defenceD10Length = defence.dice > 0
        ? defence.dice * 10 + 1
        : 0
      const defenceD10Operations = defence.dice > 0
        ? defence.dice * defenceD10Length
        : 0
      const defenceD10Float64Bytes = defence.dice > 0
        ? 2 * defenceD10Length * Float64Array.BYTES_PER_ELEMENT
        : 0
      const float64Bytes = (
        2 * fftLength +
        workingLength +
        (defence.dice > 0
          ? 2 * defenceFftLength + 2 * workingLength
          : 0)
      ) * Float64Array.BYTES_PER_ELEMENT

      expect(plan.accepted).toBe(true)
      expect(damage.scoreValueMode).toBe('full-tail')
      expect(damage.scoreValueUpperBound).toBe(scoreValueUpperBound)
      expect(damage.scoreValueUpperBound).not.toBe(1023)
      expect(damage.maxDamageDice).toBe(maxDamageDice)
      expect(damage.rawSupportMax).toBe(rawSupportMax)
      expect(damage.workingMax).toBe(workingMax)
      expect(damage.workingLength).toBe(workingLength)
      expect(damage.fftLength).toBe(fftLength)
      expect(damage.defenceFftLength).toBe(defenceFftLength)
      expect(damage.defenceD10Length).toBe(defenceD10Length)
      expect(damage.defenceD10Operations).toBe(defenceD10Operations)
      expect(damage.defenceD10Float64Bytes).toBe(defenceD10Float64Bytes)
      expect(damage.operations).toBe(operations)
      expect(damage.float64Bytes).toBe(float64Bytes)
      expect(plan.estimates.damageOperations).toBe(operations)
      expect(plan.estimates.float64Bytes).toBe(
        plan.scores.reduce((sum, scorePlan) => sum + scorePlan.float64Bytes, 0)
          + float64Bytes + defenceD10Float64Bytes
      )
      expect(plan.estimates.defenceD10Operations).toBe(defenceD10Operations)
      expect(plan.estimates.defenceD10Float64Bytes).toBe(defenceD10Float64Bytes)
    }
  )

  it.each([
    {
      label: 'action output is below reaction output',
      action: { dice: 0, critical: 11 },
      reaction: { dice: 99, critical: 2 },
      relation: 'below',
    },
    {
      label: 'action output is above reaction output',
      action: { dice: 99, critical: 2 },
      reaction: { dice: 0, critical: 11 },
      relation: 'above',
    },
    {
      label: 'action and reaction outputs are equal',
      action: { dice: 12, critical: 6 },
      reaction: { dice: 12, critical: 6 },
      relation: 'equal',
    },
  ])(
    'uses only the action score upper bound for full-tail damage ($label)',
    ({ action, reaction, relation }) => {
      const attack = { dice: 3, value: 7, kazanari: 1 }
      const defence = { dice: 2, value: -4 }
      const plan = planCalculationRanges(attackParams({
        score: {
          action: scoreParams(action),
          reaction: scoreParams(reaction),
        },
        attack,
        defence,
      }), {
        scorePropagation: 'full-tail',
        limits: PERMISSIVE_LIMITS,
      })

      const actionOutputMax = plan.scores[0].outputMax
      const reactionOutputMax = plan.scores[1].outputMax

      if (relation === 'below') {
        expect(actionOutputMax).toBeLessThan(reactionOutputMax)
      } else if (relation === 'above') {
        expect(actionOutputMax).toBeGreaterThan(reactionOutputMax)
      } else {
        expect(actionOutputMax).toBe(reactionOutputMax)
      }
      expect(plan.damage.scoreValueUpperBound).toBe(actionOutputMax)
      expect(plan.damage.maxDamageDice).toBe(
        Math.floor(actionOutputMax / 10) + 1 + attack.dice
      )
    }
  )

  it('keeps published-bucket damage compatibility independent of reaction score size', () => {
    const shared = {
      action: scoreParams({ dice: 0, critical: 11 }),
    }
    const base = planCalculationRanges(attackParams({
      score: {
        ...shared,
        reaction: scoreParams({ dice: 1, critical: 2 }),
      },
    }))
    const largerReaction = planCalculationRanges(attackParams({
      score: {
        ...shared,
        reaction: scoreParams({ dice: 99, critical: 2 }),
      },
    }))

    expect(base.damage.scoreValueMode).toBe('published-bucket')
    expect(largerReaction.damage.scoreValueMode).toBe('published-bucket')
    expect(largerReaction.damage.scoreValueUpperBound).toBe(
      base.damage.scoreValueUpperBound
    )
    expect(largerReaction.damage.maxDamageDice).toBe(base.damage.maxDamageDice)
    expect(largerReaction.damage.rawSupportMax).toBe(base.damage.rawSupportMax)
    expect(largerReaction.damage.workingMax).toBe(base.damage.workingMax)
    expect(largerReaction.damage.fftLength).toBe(base.damage.fftLength)
  })

  it('keeps damage estimates stable when only the reaction score becomes large', () => {
    const base = planCalculationRanges(attackParams({
      score: {
        action: scoreParams({ dice: 0, critical: 11 }),
        reaction: scoreParams({ dice: 1, critical: 2 }),
      },
    }), {
      scorePropagation: 'full-tail',
      limits: PERMISSIVE_LIMITS,
    })
    const largerReaction = planCalculationRanges(attackParams({
      score: {
        action: scoreParams({ dice: 0, critical: 11 }),
        reaction: scoreParams({ dice: 99, critical: 2 }),
      },
    }), {
      scorePropagation: 'full-tail',
      limits: PERMISSIVE_LIMITS,
    })

    expect(largerReaction.scores[1].outputMax).toBeGreaterThan(
      base.scores[1].outputMax
    )
    expect(largerReaction.damage.scoreValueUpperBound).toBe(
      base.damage.scoreValueUpperBound
    )
    expect(largerReaction.damage.maxDamageDice).toBe(base.damage.maxDamageDice)
    expect(largerReaction.damage.rawSupportMax).toBe(base.damage.rawSupportMax)
    expect(largerReaction.damage.workingMax).toBe(base.damage.workingMax)
    expect(largerReaction.damage.workingLength).toBe(base.damage.workingLength)
    expect(largerReaction.damage.fftLength).toBe(base.damage.fftLength)
    expect(largerReaction.estimates.damageTimeMs).toBe(
      base.estimates.damageTimeMs
    )
    expect(largerReaction.estimates.damageFftOperations).toBe(
      base.estimates.damageFftOperations
    )
    expect(largerReaction.estimates.scoreOperations).toBeGreaterThan(
      base.estimates.scoreOperations
    )
    expect(largerReaction.estimates.timeMs).toBeGreaterThan(
      base.estimates.timeMs
    )
  })

  it('applies resource warning and hard-reject thresholds to dynamic full-tail ranges', () => {
    const params = attackParams({
      score: {
        action: scoreParams({ dice: 99, critical: 2, skill: -20 }),
        reaction: scoreParams({ dice: 1, critical: 11, skill: 0 }),
      },
      attack: { dice: 99, value: 5, kazanari: 9 },
      defence: { dice: 99, value: -5 },
    })
    const baseline = planCalculationRanges(params, {
      scorePropagation: 'full-tail',
    })
    const maximumScoreWorkingLength = Math.max(
      ...baseline.scores.map((score) => score.workingLength)
    )
    const maximumScoreFftLength = Math.max(
      ...baseline.scores.map((score) => score.fftLength),
      baseline.damage.fftLength,
      baseline.damage.defenceFftLength
    )
    const warning = planCalculationRanges(params, {
      scorePropagation: 'full-tail',
      limits: {
        warning: {
          estimatedTimeMs: Math.max(0, baseline.estimates.timeMs - 1e-6),
          estimatedMemoryBytes: baseline.estimates.float64Bytes - 1,
          workingLength: baseline.damage.workingLength - 1,
          fftLength: baseline.damage.fftLength - 1,
        },
        hard: {
          estimatedTimeMs: baseline.estimates.timeMs + 1,
          estimatedMemoryBytes: baseline.estimates.float64Bytes + 1,
          workingLength: Math.max(
            maximumScoreWorkingLength,
            baseline.damage.workingLength + 1
          ),
          fftLength: Math.max(maximumScoreFftLength, baseline.damage.fftLength + 1),
        },
      },
    })

    expect(warning.accepted).toBe(true)
    expect(warning.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'damage-working-length', severity: 'warning' }),
      expect.objectContaining({ code: 'damage-fft-length', severity: 'warning' }),
      expect.objectContaining({ code: 'estimated-memory', severity: 'warning' }),
      expect.objectContaining({ code: 'estimated-time', severity: 'warning' }),
    ]))

    const hardReject = planCalculationRanges(params, {
      scorePropagation: 'full-tail',
      limits: {
        warning: {
          estimatedTimeMs: 0,
          estimatedMemoryBytes: 0,
          workingLength: 0,
          fftLength: 0,
        },
        hard: {
          estimatedTimeMs: Math.max(0, baseline.estimates.timeMs - 1e-6),
          estimatedMemoryBytes: baseline.estimates.float64Bytes - 1,
          workingLength: baseline.damage.workingLength - 1,
          fftLength: baseline.damage.fftLength - 1,
        },
      },
    })

    expect(hardReject.accepted).toBe(false)
    expect(hardReject.rejectionReasons).toEqual(expect.arrayContaining([
      'damage-working-length',
      'damage-fft-length',
      'estimated-memory',
      'estimated-time',
    ]))
  })

  it('rejects a resource-heavy but rule-valid attack before allocation', () => {
    const plan = planCalculationRanges(attackParams({
      score: {
        action: scoreParams({ critical: 11 }),
        reaction: scoreParams({ critical: 11 }),
      },
      attack: { dice: 100_000, value: 0, kazanari: 100_000 },
      defence: { dice: 0, value: 0 },
    }), {
      scorePropagation: 'full-tail',
    })

    expect(plan.accepted).toBe(false)
    expect(plan.rejectionReasons).toEqual(expect.arrayContaining([
      'damage-fft-length',
      'estimated-time',
    ]))
    expect(plan.damage.maxDamageDice).toBeGreaterThan(100_000)
    expect(plan.damage.effectiveKazanari).toBeLessThanOrEqual(
      plan.damage.maxDamageDice
    )
  })

  it('accounts for runtime defence D10 generation in the resource estimate', () => {
    const limits = { limits: PERMISSIVE_LIMITS }
    const withoutDefence = planCalculationRanges(attackParams({
      defence: { dice: 0, value: 0 },
    }), limits)
    const withDefence = planCalculationRanges(attackParams({
      defence: { dice: 100, value: 0 },
    }), limits)

    expect(withDefence.damage.defenceD10Length).toBe(1001)
    expect(withDefence.damage.defenceD10Operations).toBe(100100)
    expect(withDefence.damage.defenceD10Float64Bytes).toBe(
      2 * 1001 * Float64Array.BYTES_PER_ELEMENT
    )
    expect(withDefence.estimates.defenceD10Operations).toBe(100100)
    expect(withDefence.estimates.defenceD10TimeMs).toBeGreaterThan(0)
    expect(withDefence.estimates.float64Bytes).toBe(
      withoutDefence.estimates.float64Bytes +
        withDefence.damage.defenceD10Float64Bytes +
        (withDefence.damage.float64Bytes - withoutDefence.damage.float64Bytes)
    )
    expect(withDefence.estimates.operations).toBeGreaterThan(
      withoutDefence.estimates.operations
    )
    expect(withDefence.estimates.timeMs).toBeGreaterThan(
      withoutDefence.estimates.timeMs
    )
  })

  it('rejects defence D10 generation before the runtime absolute operation guard', () => {
    let dice = 1
    while (
      getD10GenerationOperationEstimate(dice, getD10RequiredLength(dice)) <=
      D10_MAX_GENERATION_OPERATIONS
    ) {
      dice += 1
    }

    const permissive = { limits: PERMISSIVE_LIMITS }
    const justBelow = planCalculationRanges(attackParams({
      defence: { dice: dice - 1, value: 0 },
    }), permissive)
    const justAbove = planCalculationRanges(attackParams({
      defence: { dice, value: 0 },
    }), permissive)

    expect(justBelow.damage.defenceD10Operations)
      .toBeLessThanOrEqual(D10_MAX_GENERATION_OPERATIONS)
    expect(justBelow.accepted).toBe(true)
    expect(justAbove.damage.defenceD10Operations)
      .toBeGreaterThan(D10_MAX_GENERATION_OPERATIONS)
    expect(justAbove.accepted).toBe(false)
    expect(justAbove.rejectionReasons).toContain('defence-d10-generation')
  })

  it('retains the public overflow score bucket for a lower calculation maximum', () => {
    const params = attackParams()
    const published = planCalculationRanges(params, {
      calculationMax: 0,
      display: { defaultMax: 0 },
    })
    const fullTail = planCalculationRanges(params, {
      calculationMax: 0,
      display: { defaultMax: 0 },
      scorePropagation: 'full-tail',
    })

    expect(published.scores[0].publishedOutputMax).toBe(
      OUTPUT_DISTRIBUTION_SIZE - 1
    )
    expect(published.damage.scoreValueUpperBound).toBe(
      OUTPUT_DISTRIBUTION_SIZE - 1
    )
    expect(published.damage.maxDamageDice).toBe(103)
    expect(published.damage.rawSupportMax).toBe(1030)
    expect(fullTail.damage.scoreValueUpperBound).toBe(
      fullTail.scores[0].outputMax
    )
    expect(fullTail.damage.rawSupportMax).toBe(10)
  })

  it('keeps the Lois rule boundary and separates static asset coverage', () => {
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
        lois: 0,
        elois: 0,
        dice: 300,
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
    expect(overflow.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'backtrack-asset-overflow' })
    )
    expect(overflow.overflowInfo.backtrack.type).toBe('finite-support')
    expect(overflow.overflowInfo.backtrack.lowerBound).toBeNull()
    expect(overflow.backtrack.distributionMode).toBe('on-demand')
    expect(overflow.backtrack.fftLength).toBe(0)
  })

  it('uses the rule-specific livingdead support boundary', () => {
    const livingdead = planCalculationRanges({
      operation: 'backtrack',
      backtrack: {
        lois: 0,
        elois: 0,
        dice: 103,
        value: 0,
        dlois: '\u5c4d\u4eba',
      },
    })
    const ordinary = planCalculationRanges({
      operation: 'backtrack',
      backtrack: {
        lois: 0,
        elois: 0,
        dice: 103,
        value: 0,
        dlois: '\u306a\u3057',
      },
    })

    expect(livingdead.backtrack.rawSupportMax).toBe(1021)
    expect(livingdead.backtrack.workingLength).toBe(1022)
    expect(livingdead.backtrack.distributionMode).toBe('asset')
    expect(livingdead.backtrack.assetOverflow).toBe(false)
    expect(livingdead.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'backtrack-asset-overflow' })
    )

    expect(ordinary.backtrack.rawSupportMax).toBe(1030)
    expect(ordinary.backtrack.workingLength).toBe(1031)
    expect(ordinary.backtrack.distributionMode).toBe('on-demand')
    expect(ordinary.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'backtrack-asset-overflow' })
    )
  })

  it('keeps the asset boundary independent from a lower calculation maximum', () => {
    const plan = planCalculationRanges({
      operation: 'backtrack',
      backtrack: {
        encroachment: 100,
        lois: 0,
        elois: 0,
        dice: 1,
        value: 0,
        dlois: 'なし',
      },
    }, {
      calculationMax: 0,
    })

    expect(plan.backtrack.assetOverflow).toBe(false)
    expect(plan.backtrack.distributionMode).toBe('asset')
    expect(plan.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'backtrack-asset-overflow' })
    )
  })

  it('calibrates damage-roll reroll cost without hiding dice or FFT work', () => {
    expect(DEFAULT_POLICY.limits.hard.estimatedTimeMs).toBe(200)

    const makePlan = ({ attackDice, kazanari }) => planCalculationRanges(
      attackParams({
        score: {
          action: scoreParams({ critical: 11 }),
          reaction: scoreParams({ critical: 11 }),
        },
        attack: { dice: attackDice, value: 0, kazanari },
        defence: { dice: 0, value: 0 },
      }),
      {
        scorePropagation: 'full-tail',
        limits: PERMISSIVE_LIMITS,
      }
    )

    const noRerolls = makePlan({ attackDice: 99, kazanari: 0 })
    const oneReroll = makePlan({ attackDice: 99, kazanari: 1 })
    const nineRerolls = makePlan({ attackDice: 99, kazanari: 9 })
    const smallerDamageRange = makePlan({ attackDice: 0, kazanari: 0 })
    const largerDamageRange = makePlan({ attackDice: 197, kazanari: 0 })

    expect(
      oneReroll.damage.operations / noRerolls.damage.operations
    ).toBeCloseTo(1 + 15 * Math.log1p(1), 10)
    expect(
      nineRerolls.damage.operations / noRerolls.damage.operations
    ).toBeCloseTo(1 + 15 * Math.log1p(9), 10)

    expect(smallerDamageRange.damage.maxDamageDice).toBe(103)
    expect(largerDamageRange.damage.maxDamageDice).toBe(300)
    expect(largerDamageRange.damage.fftLength).toBeGreaterThan(
      smallerDamageRange.damage.fftLength
    )
    expect(largerDamageRange.damage.operations).toBeGreaterThan(
      smallerDamageRange.damage.operations
    )
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
