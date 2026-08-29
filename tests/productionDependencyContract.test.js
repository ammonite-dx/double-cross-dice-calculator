import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/application/CalculationClient'

const scoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

function createPlan(operation) {
  if (operation === 'check') {
    return { accepted: true, operation, scores: [{}, {}], warnings: [] }
  }
  if (operation === 'attack') {
    return {
      accepted: true,
      operation,
      propagation: { score: 'full-tail' },
      scores: [{}, {}],
      damage: {},
      warnings: [],
    }
  }
  return { accepted: true, operation, backtrack: {}, warnings: [] }
}

function createAttackParams(reactionDamageDice) {
  return {
    action: {
      score: { ...scoreParams },
      damage: { dice: 0, value: 0, kazanari: 0 },
    },
    reaction: {
      mode: 'ドッジ',
      score: { ...scoreParams },
      damage: { dice: reactionDamageDice, value: 0 },
    },
  }
}

function createBacktrackParams() {
  return {
    encroachment: 79,
    lois: 1,
    elois: 2,
    dice: 1,
    value: 20,
    dlois: 'なし',
  }
}

function createHarness(overrides = {}) {
  const getD10Distribution = vi.fn()
  const getDamageRollDistribution = vi.fn()
  const calculateScoreCanonical = vi.fn(() => ({ kind: 'score' }))
  const calculateCanonicalDamageOnDemand = vi.fn(async () => ({
    kind: 'damage',
  }))
  const getFinalEncroachmentCanonical = vi.fn(() => ({
    kind: 'backtrack',
  }))
  const getCanonicalScoreSummary = vi.fn(() => ({ kind: 'score-summary' }))
  const getCanonicalDamageSummary = vi.fn(() => ({ kind: 'damage-summary' }))
  const release = vi.fn()
  const resourceGuard = {
    acquirePlan: vi.fn(() => ({ release })),
  }
  const planCalculationRanges = vi.fn(({ operation }) => createPlan(operation))
  const dependencies = {
    calculateCanonicalDamageOnDemand,
    calculateScoreCanonical,
    getCanonicalDamageSummary,
    getCanonicalScoreSummary,
    getD10Distribution,
    getDamageRollDistribution,
    getFinalEncroachmentCanonical,
    planCalculationRanges,
    resourceGuard,
    ...overrides,
  }
  const client = createCalculationClient(dependencies)

  return {
    client,
    calculateCanonicalDamageOnDemand,
    calculateScoreCanonical,
    getCanonicalDamageSummary,
    getCanonicalScoreSummary,
    getD10Distribution,
    getDamageRollDistribution,
    getFinalEncroachmentCanonical,
    planCalculationRanges,
    release,
  }
}

describe('CalculationClient runtime dependency contract', () => {
  it('does not request precomputed assets for Check', async () => {
    const harness = createHarness()
    const result = await harness.client.calculateCheckCanonical({
      action: { ...scoreParams },
      reaction: { ...scoreParams },
    }, { opposed: false, target: 0 })

    expect(result.score).toEqual({
      action: { kind: 'score' },
      reaction: { kind: 'score' },
    })
    expect(harness.calculateScoreCanonical).toHaveBeenCalledTimes(2)
    expect(harness.getD10Distribution).not.toHaveBeenCalled()
  })

  it('passes the runtime D10 provider directly to Attack damage', async () => {
    const harness = createHarness()
    await harness.client.calculateAttackCanonical(createAttackParams(1))

    expect(harness.calculateCanonicalDamageOnDemand).toHaveBeenCalledOnce()
    const [, , , damageDependencies] =
      harness.calculateCanonicalDamageOnDemand.mock.calls[0]
    expect(damageDependencies.getD10Distribution)
      .toBe(harness.getD10Distribution)
  })

  it('releases the resource lease when Attack damage fails', async () => {
    const error = new Error('runtime damage unavailable')
    const harness = createHarness({
      calculateCanonicalDamageOnDemand: vi.fn(async () => {
        throw error
      }),
    })

    await expect(
      harness.client.calculateAttackCanonical(createAttackParams(1))
    ).rejects.toBe(error)
    expect(harness.release).toHaveBeenCalledOnce()
  })

  it('uses canonical on-demand Backtrack without a data request', async () => {
    const harness = createHarness()
    const result = await harness.client.calculateBacktrackCanonical(
      createBacktrackParams()
    )

    expect(result).toEqual({ kind: 'backtrack' })
    expect(harness.getFinalEncroachmentCanonical).toHaveBeenCalledOnce()
    expect(harness.getD10Distribution).not.toHaveBeenCalled()
  })
})
