import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findTailCutoff,
  nextPowerOfTwo,
  planCalculationRanges,
  scoreTailBound,
} from './planner.mjs'

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

function scoreOnlyParams(overrides = {}) {
  return {
    operation: 'score',
    score: scoreParams(),
    ...overrides,
  }
}

test('tail cutoff is a boundary and the tail bound is monotone', () => {
  const params = { dice: 99, critical: 2, shihai: 0, yousei: 0 }
  const epsilon = 1e-8
  const cutoff = findTailCutoff(params, epsilon)

  assert.equal(cutoff.reachable, true)
  assert.ok(cutoff.bound <= epsilon)
  assert.ok(scoreTailBound(cutoff.cutoff - 1, params) > epsilon)

  let previous = scoreTailBound(0, params)
  for (let value = 1; value <= cutoff.cutoff; value += 1) {
    const current = scoreTailBound(value, params)
    assert.ok(current <= previous + 1e-12)
    previous = current
  }
})

test('critical 11 with zero dice has zero tail and zero cutoff', () => {
  const plan = planCalculationRanges(scoreOnlyParams())
  const tail = plan.scores[0].tail

  assert.equal(plan.accepted, true)
  assert.equal(tail.model, 'exact-max')
  assert.equal(tail.cutoff, 0)
  assert.equal(tail.bound, 0)
})

test('yousei uses the exact-yousei model', () => {
  const plan = planCalculationRanges(scoreOnlyParams({
    score: scoreParams({ dice: 10, critical: 2, yousei: 1 }),
  }))

  assert.equal(plan.scores[0].tail.model, 'exact-yousei')
})

test('shihai and yousei are rejected together in compatibility mode', () => {
  const plan = planCalculationRanges(scoreOnlyParams({
    score: scoreParams({ dice: 10, critical: 2, shihai: 1, yousei: 1 }),
  }))

  assert.equal(plan.accepted, false)
  assert.equal(plan.scores[0].tail.model, 'conservative-union-bound')
  assert.ok(plan.rejectionReasons.includes('incompatible-input'))
  assert.equal(
    plan.warnings.find((warning) => warning.code === 'incompatible-input').severity,
    'reject',
  )
})

test('check plans two scores and no damage range', () => {
  const plan = planCalculationRanges({
    operation: 'check',
    score: {
      action: scoreParams({ dice: 20, critical: 2 }),
      reaction: scoreParams({ dice: 10, critical: 7 }),
    },
  })

  assert.equal(plan.operation, 'check')
  assert.equal(plan.damage, null)
  assert.equal(plan.scores.length, 2)
  assert.equal(plan.scores[0].tail.requested, 4e-9)
  assert.equal(plan.scores[1].tail.requested, 4e-9)
})

test('exact-yousei handles ten boundaries and the stress cutoff', () => {
  const oneUse = { dice: 1, critical: 11, shihai: 0, yousei: 1 }
  assert.equal(scoreTailBound(10, oneUse), 1)
  assert.equal(scoreTailBound(20, oneUse), 0)

  const zeroDice = { dice: 0, critical: 2, shihai: 0, yousei: 9 }
  assert.equal(scoreTailBound(0, zeroDice), 0)
  assert.deepEqual(findTailCutoff(zeroDice, 1e-8), {
    reachable: true,
    cutoff: 0,
    bound: 0,
  })

  for (const critical of [1, 12, 2.5]) {
    assert.throws(() => scoreTailBound(0, {
      dice: 0,
      critical,
      shihai: 0,
      yousei: 1,
    }), RangeError)
  }

  assert.throws(() => scoreTailBound(Number.NaN, oneUse), RangeError)
  assert.equal(scoreTailBound(Number.POSITIVE_INFINITY, oneUse), 0)
  assert.equal(scoreTailBound(Number.NEGATIVE_INFINITY, oneUse), 1)

  const cutoffParams = { dice: 99, critical: 2, shihai: 0, yousei: 9 }
  const cutoff = findTailCutoff(cutoffParams, 1e-8)
  assert.ok(cutoff.bound <= 1e-8)
  assert.ok(scoreTailBound(cutoff.cutoff - 1, cutoffParams) > 1e-8)

  const stress = planCalculationRanges(scoreOnlyParams({
    score: scoreParams({ dice: 99, critical: 2, yousei: 9 }),
  }))
  assert.equal(stress.accepted, true)
  assert.equal(stress.scores[0].tail.model, 'exact-yousei')
  assert.ok(stress.scores[0].workingLength < 16384)
  assert.ok(stress.scores[0].tail.bound <= 1e-8)
})

test('finite damage support and FFT lengths cover their required ranges', () => {
  const plan = planCalculationRanges(attackParams({
    attack: { dice: 10, value: 0, kazanari: 0 },
    defence: { dice: 10, value: 0 },
  }))
  const damage = plan.damage
  const requiredDefenceConvolution = damage.workingLength + damage.defenceMax

  assert.equal(damage.finiteSupport, true)
  assert.equal(damage.rawSupportMax, 1130)
  assert.equal(damage.fftLength, nextPowerOfTwo(damage.rawSupportMax + 1))
  assert.ok(damage.fftLength >= damage.rawSupportMax + 1)
  assert.equal(
    damage.defenceFftLength,
    nextPowerOfTwo(requiredDefenceConvolution),
  )
  assert.ok(damage.defenceFftLength >= requiredDefenceConvolution)
})

test('estimated-time warning and hard limits have exact boundaries', () => {
  const params = scoreOnlyParams({ score: scoreParams({ critical: 2 }) })
  const costModel = {
    dxOperationsPerMs: 1,
    fftOperationsPerMs: 1,
    damageOperationsPerMs: 1,
    backtrackOperationsPerMs: 1,
  }
  const baseline = planCalculationRanges(params, { costModel })
  const time = baseline.estimates.timeMs

  const exact = planCalculationRanges(params, {
    costModel,
    limits: {
      warning: { estimatedTimeMs: time },
      hard: { estimatedTimeMs: time },
    },
  })
  assert.equal(exact.accepted, true)
  assert.equal(
    exact.warnings.some((warning) => warning.code === 'estimated-time'),
    false,
  )

  const warning = planCalculationRanges(params, {
    costModel,
    limits: {
      warning: { estimatedTimeMs: time - 1 },
      hard: { estimatedTimeMs: time + 1 },
    },
  })
  assert.equal(warning.accepted, true)
  assert.equal(
    warning.warnings.find((item) => item.code === 'estimated-time').severity,
    'warning',
  )

  const hard = planCalculationRanges(params, {
    costModel,
    limits: {
      warning: { estimatedTimeMs: time - 1 },
      hard: { estimatedTimeMs: time - 0.5 },
    },
  })
  assert.equal(hard.accepted, false)
  assert.ok(hard.rejectionReasons.includes('estimated-time'))
})

test('FFT time uses the dedicated FFT operation coefficient', () => {
  const params = scoreOnlyParams({
    score: scoreParams({ dice: 10, critical: 2, yousei: 1 }),
  })
  const commonCostModel = {
    dxOperationsPerMs: 1_000_000,
    damageOperationsPerMs: 1_000_000,
    backtrackOperationsPerMs: 1_000_000,
  }
  const slowerFft = planCalculationRanges(params, {
    costModel: { ...commonCostModel, fftOperationsPerMs: 1_000_000 },
  })
  const fasterFft = planCalculationRanges(params, {
    costModel: { ...commonCostModel, fftOperationsPerMs: 2_000_000 },
  })

  assert.ok(slowerFft.estimates.scoreFftOperations > 0)
  assert.ok(fasterFft.estimates.timeMs < slowerFft.estimates.timeMs)
})

test('published-bucket and full-tail produce different damage ranges', () => {
  const params = attackParams({
    score: {
      action: scoreParams({ dice: 200, critical: 2, skill: 500 }),
      reaction: scoreParams({ dice: 99, critical: 8 }),
    },
    attack: { dice: 150, value: 500, kazanari: 0 },
    defence: { dice: 99, value: -500 },
  })
  const published = planCalculationRanges(params)
  const fullTail = planCalculationRanges(params, { scorePropagation: 'full-tail' })

  assert.equal(published.damage.scoreValueMode, 'published-bucket')
  assert.equal(fullTail.damage.scoreValueMode, 'full-tail')
  assert.equal(published.damage.maxDamageDice, 253)
  assert.equal(fullTail.damage.maxDamageDice, 434)
  assert.ok(fullTail.damage.scoreValueUpperBound > published.damage.scoreValueUpperBound)
})
