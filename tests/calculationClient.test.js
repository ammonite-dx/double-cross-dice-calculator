import { describe, expect, it, vi } from 'vitest'

import {
  createCalculationClient,
} from '../src/application/CalculationClient'
import { calculateDamageOnDemand } from '../src/calculation/DamageCalculator'

function createDependencies(overrides = {}) {
  return {
    calculateDamageOnDemand: vi.fn(async (
      _score,
      attack,
      _defence,
      damageDependencies,
      options
    ) => {
      await damageDependencies.getDamageRollDistribution(
        new Float64Array([1, 0]),
        attack.kazanari,
        options
      )
      return 'damage'
    }),
    getDamageSummary: vi.fn(() => 'damage summary'),
    getDamageRollDistribution: vi.fn(async () => {}),
    getFinalEncroachment: vi.fn(() => 'backtrack'),
    getD10Distribution: vi.fn(),
    getScore: vi.fn((params, fix = false) => ({ params, fix })),
    getScoreSummary: vi.fn(() => 'score summary'),
    getTotalDamage: vi.fn(() => 'total damage'),
    loadD10Asset: vi.fn(async () => {}),
    loadDrAsset: vi.fn(async () => {}),
    loadDxAsset: vi.fn(async () => {}),
    loadLivingdeadAsset: vi.fn(async () => {}),
    ...overrides,
  }
}

const scoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

function attackParams() {
  return {
    action: {
      score: { ...scoreParams, shihai: 2 },
      damage: { dice: 0, value: 3, kazanari: 4 },
    },
    reaction: {
      mode: '《イベイジョン》',
      score: { ...scoreParams, shihai: 1 },
      damage: { dice: 2, value: 1 },
    },
  }
}

describe('CalculationClient', () => {
  it.each([
    ['check', []],
    ['attack', ['loadD10Asset']],
    ['backtrack', ['loadD10Asset', 'loadLivingdeadAsset']],
  ])('prepares %s route assets', async (routeName, loaders) => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)

    await client.prepare(routeName)

    for (const loader of loaders) {
      expect(dependencies[loader]).toHaveBeenCalled()
    }
    expect(dependencies.loadDxAsset).not.toHaveBeenCalled()
    expect(dependencies.loadDrAsset).not.toHaveBeenCalled()
  })

  it('calculates a check from an input snapshot', async () => {
    let finishLoading
    const loading = new Promise((resolve) => {
      finishLoading = resolve
    })
    const dependencies = createDependencies({
      loadDxAsset: vi.fn(() => loading),
    })
    const client = createCalculationClient(dependencies)
    const params = {
      action: { ...scoreParams, shihai: 2 },
      reaction: { ...scoreParams, shihai: 3 },
    }

    const result = client.calculateCheck(params, {
      opposed: true,
      target: 0,
    })
    params.action.shihai = 9
    finishLoading()

    await expect(result).resolves.toMatchObject({
      scoreSummary: 'score summary',
    })
    expect(dependencies.loadDxAsset).not.toHaveBeenCalled()
    expect(dependencies.getScore).toHaveBeenNthCalledWith(
      1,
      { ...scoreParams, shihai: 2 }
    )
  })

  it('calculates an attack combo atomically', async () => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)
    const params = attackParams()

    await expect(client.calculateAttackCombo(params)).resolves.toMatchObject({
      scoreSummary: 'score summary',
      damage: 'damage',
      damageSummary: 'damage summary',
    })

    expect(dependencies.loadDxAsset).not.toHaveBeenCalled()
    expect(dependencies.loadDrAsset).not.toHaveBeenCalled()
    expect(dependencies.loadD10Asset).toHaveBeenCalledOnce()
    expect(dependencies.getScore).toHaveBeenNthCalledWith(
      2,
      params.reaction.score,
      true
    )
    expect(dependencies.calculateDamageOnDemand).toHaveBeenCalledOnce()
    expect(dependencies.getDamageRollDistribution).toHaveBeenCalledWith(
      new Float64Array([1, 0]),
      4,
      {}
    )
  })

  it('injects and caches runtime DX distributions without loading JSON', async () => {
    const calculateDxDistribution = vi.fn(
      () => new Float64Array(2048)
    )
    const calculateScore = vi.fn((params, getDxDistribution, fix = false) => ({
      params,
      fix,
      distribution: fix
        ? undefined
        : getDxDistribution(params.shihai, params.dice, params.critical),
    }))
    const dependencies = createDependencies({
      calculateDxDistribution,
      calculateScore,
    })
    const client = createCalculationClient(dependencies)
    const params = {
      action: { ...scoreParams, dice: 20, critical: 7, shihai: 3 },
      reaction: { ...scoreParams, dice: 20, critical: 7, shihai: 3 },
    }

    await client.calculateCheck(params, { opposed: true, target: 0 })
    await client.calculateCheck(params, { opposed: true, target: 0 })

    expect(calculateDxDistribution).toHaveBeenCalledOnce()
    expect(calculateDxDistribution).toHaveBeenCalledWith({
      dice: 20,
      critical: 7,
      shihai: 3,
    })
    expect(dependencies.loadDxAsset).not.toHaveBeenCalled()
  })

  it('passes calculation options to the resident runtime provider', async () => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)
    const options = {
      signal: new AbortController().signal,
      requestId: 'combo-1',
    }

    await client.calculateAttackCombo(attackParams(), options)
    await client.calculateAttackCombo(attackParams(), options)

    expect(dependencies.getDamageRollDistribution).toHaveBeenCalledTimes(2)
    expect(dependencies.getDamageRollDistribution)
      .toHaveBeenNthCalledWith(
        1,
        new Float64Array([1, 0]),
        4,
        options
      )
    expect(dependencies.getDamageRollDistribution)
      .toHaveBeenNthCalledWith(
        2,
        new Float64Array([1, 0]),
        4,
        options
      )
  })

  it('passes on-demand weights, kazanari, and options to the runtime provider', async () => {
    const actionDistribution = Array(1024).fill(0)
    actionDistribution[10] = 1
    const reactionUpperTailProbability = Array(1024).fill(0)
    const options = { requestId: 'combo-2' }
    const dependencies = createDependencies({
      calculateDamageOnDemand,
      getDamageRollDistribution: vi.fn(async () => new Float64Array(2048)),
      getScore: vi.fn()
        .mockReturnValueOnce({ distribution: actionDistribution })
        .mockReturnValueOnce({ upperTailProbability: reactionUpperTailProbability }),
    })
    const client = createCalculationClient(dependencies)
    const params = attackParams()
    params.action.damage = { dice: 0, value: 0, kazanari: 4 }
    params.reaction.damage = { dice: 0, value: 0 }

    await client.calculateAttackCombo(params, options)

    expect(dependencies.getDamageRollDistribution).toHaveBeenCalledOnce()
    const [weights, kazanari, passedOptions] =
      dependencies.getDamageRollDistribution.mock.calls[0]
    expect(weights).toBeInstanceOf(Float64Array)
    expect(weights).toHaveLength(203)
    expect(weights[2]).toBe(1)
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(1)
    expect(kazanari).toBe(4)
    expect(passedOptions).toBe(options)
  })

  it('calculates total damage and its summary together', async () => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)

    await expect(client.calculateTotalDamage(['combo'])).resolves.toEqual({
      totalDamage: 'total damage',
      totalDamageSummary: 'damage summary',
    })
    expect(dependencies.getDamageSummary)
      .toHaveBeenCalledWith('total damage')
  })

  it.each([
    ['屍人', 'loadLivingdeadAsset'],
    ['なし', 'loadD10Asset'],
  ])('loads the correct backtrack data for %s', async (dlois, loader) => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)
    const params = { dlois }

    await expect(client.calculateBacktrack(params))
      .resolves.toBe('backtrack')

    expect(dependencies[loader]).toHaveBeenCalledOnce()
    expect(dependencies.getFinalEncroachment).toHaveBeenCalledWith(params)
  })
})
