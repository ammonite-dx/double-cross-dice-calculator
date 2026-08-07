import { describe, expect, it, vi } from 'vitest'

import {
  createCalculationClient,
} from '../src/application/CalculationClient'

function createDependencies(overrides = {}) {
  return {
    getDamage: vi.fn(() => 'damage'),
    getDamageSummary: vi.fn(() => 'damage summary'),
    getFinalEncroachment: vi.fn(() => 'backtrack'),
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
    ['check', ['loadDxAsset']],
    ['attack', ['loadDxAsset', 'loadDrAsset', 'loadD10Asset']],
    ['backtrack', ['loadD10Asset', 'loadLivingdeadAsset']],
  ])('prepares %s route assets', async (routeName, loaders) => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)

    await client.prepare(routeName)

    for (const loader of loaders) {
      expect(dependencies[loader]).toHaveBeenCalled()
    }
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

    expect(dependencies.loadDxAsset).toHaveBeenCalledWith(2)
    expect(dependencies.loadDxAsset).toHaveBeenCalledWith(1)
    expect(dependencies.loadDrAsset).toHaveBeenCalledWith(4)
    expect(dependencies.loadD10Asset).toHaveBeenCalledOnce()
    expect(dependencies.getScore).toHaveBeenNthCalledWith(
      2,
      params.reaction.score,
      true
    )
    expect(dependencies.getDamage).toHaveBeenCalledOnce()
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
