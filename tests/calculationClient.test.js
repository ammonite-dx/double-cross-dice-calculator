import { describe, expect, it, vi } from 'vitest'

import {
  CalculationRangeError,
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
  it('exposes planner methods with snapshotted route mappings', () => {
    const plan = { accepted: true }
    const planCalculationRanges = vi.fn(() => plan)
    const dependencies = createDependencies({ planCalculationRanges })
    const client = createCalculationClient(dependencies)
    const params = attackParams()
    const policy = { limits: { hard: { estimatedTimeMs: 1 } } }

    expect(client.planCheck(
      {
        action: { ...scoreParams },
        reaction: { ...scoreParams, skill: 2 },
      },
      { opposed: true, target: 9 },
      policy
    )).toBe(plan)
    expect(client.planAttackCombo(params, policy)).toBe(plan)
    expect(client.planBacktrack({ dlois: '屍人', lois: 2 }, policy)).toBe(plan)

    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      1,
      {
        operation: 'check',
        score: {
          action: { ...scoreParams },
          reaction: { ...scoreParams, skill: 2 },
        },
      },
      policy
    )
    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      2,
      {
        operation: 'attack',
        score: {
          action: { ...params.action.score },
          reaction: {
            ...params.reaction.score,
            dice: 0,
            critical: 11,
            shihai: 0,
            yousei: 0,
          },
        },
        attack: { ...params.action.damage },
        defence: { ...params.reaction.damage },
      },
      policy
    )
    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      3,
      {
        operation: 'backtrack',
        backtrack: { dlois: '屍人', lois: 2 },
      },
      policy
    )
  })

  it('uses a plan snapshot when the source input changes', () => {
    const planCalculationRanges = vi.fn(() => ({ accepted: true }))
    const dependencies = createDependencies({ planCalculationRanges })
    const client = createCalculationClient(dependencies)
    const params = attackParams()

    client.planAttackCombo(params)
    params.action.score.dice = 99
    params.action.damage.value = 999
    params.reaction.damage.dice = 99

    expect(planCalculationRanges.mock.calls[0][0]).toMatchObject({
      score: {
        action: { dice: 1 },
      },
      attack: { value: 3 },
      defence: { dice: 2 },
    })
  })

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
    const onRangePlan = vi.fn()
    const params = {
      action: { ...scoreParams, shihai: 2 },
      reaction: { ...scoreParams, shihai: 3 },
    }

    const result = client.calculateCheck(params, {
      opposed: true,
      target: 0,
    }, { onRangePlan })
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
    expect(onRangePlan).toHaveBeenCalledTimes(1)
    expect(onRangePlan.mock.calls[0][0].operation).toBe('check')
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

  it('runs the range preflight before calculation and publishes one plan', async () => {
    const plan = {
      accepted: true,
      warnings: ['warning'],
      damage: { workingLength: 123, fftLength: 128 },
    }
    const planCalculationRanges = vi.fn(() => plan)
    const onRangePlan = vi.fn()
    const rangePolicy = { limits: { hard: { estimatedTimeMs: 1 } } }
    const options = {
      signal: new AbortController().signal,
      requestId: 'combo-preflight',
      rangePolicy,
      onRangePlan,
    }
    const optionsSnapshot = { ...options }
    const dependencies = createDependencies({ planCalculationRanges })
    const client = createCalculationClient(dependencies)

    await client.calculateAttackCombo(attackParams(), options)

    expect(planCalculationRanges).toHaveBeenCalledOnce()
    expect(onRangePlan).toHaveBeenCalledTimes(1)
    expect(onRangePlan).toHaveBeenCalledWith(plan)
    expect(dependencies.calculateDamageOnDemand.mock.calls[0][4]).toEqual({
      signal: options.signal,
      requestId: 'combo-preflight',
    })
    expect(dependencies.calculateDamageOnDemand.mock.calls[0][5])
      .toBe(plan.damage)
    expect(options).toEqual(optionsSnapshot)
    expect(options.rangePolicy).toBe(rangePolicy)
    expect(options.onRangePlan).toBe(onRangePlan)
  })

  it('rejects a check before score calculation dependencies are called', async () => {
    const plan = {
      accepted: false,
      rejectionReasons: ['incompatible-input'],
      warnings: [{ code: 'incompatible-input', severity: 'reject' }],
    }
    const calculateScore = vi.fn()
    const calculateDxDistribution = vi.fn()
    const planCalculationRanges = vi.fn(() => plan)
    const dependencies = createDependencies({
      calculateDxDistribution,
      calculateScore,
      planCalculationRanges,
    })
    const client = createCalculationClient(dependencies)
    const onRangePlan = vi.fn()

    await expect(client.calculateCheck(
      {
        action: { ...scoreParams },
        reaction: { ...scoreParams },
      },
      { opposed: true, target: 0 },
      { onRangePlan }
    )).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(CalculationRangeError)
      expect(error.plan).toBe(plan)
      expect(error.rejectionReasons).toBe(plan.rejectionReasons)
      return true
    })

    expect(onRangePlan).toHaveBeenCalledTimes(1)
    expect(onRangePlan).toHaveBeenCalledWith(plan)
    expect(dependencies.getScore).not.toHaveBeenCalled()
    expect(calculateScore).not.toHaveBeenCalled()
    expect(calculateDxDistribution).not.toHaveBeenCalled()
    expect(dependencies.getScoreSummary).not.toHaveBeenCalled()
  })

  it('throws CalculationRangeError before loading or calculating on a hard reject', async () => {
    const plan = {
      accepted: false,
      rejectionReasons: ['estimated-time'],
      warnings: [{ code: 'estimated-time', severity: 'reject' }],
    }
    const dependencies = createDependencies({
      planCalculationRanges: vi.fn(() => plan),
    })
    const client = createCalculationClient(dependencies)
    const onRangePlan = vi.fn()

    await expect(client.calculateAttackCombo(attackParams(), {
      onRangePlan,
    })).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(CalculationRangeError)
      expect(error.plan).toBe(plan)
      expect(error.rejectionReasons).toBe(plan.rejectionReasons)
      return true
    })
    expect(onRangePlan).toHaveBeenCalledTimes(1)
    expect(onRangePlan).toHaveBeenCalledWith(plan)
    expect(dependencies.loadD10Asset).not.toHaveBeenCalled()
    expect(dependencies.getScore).not.toHaveBeenCalled()
    expect(dependencies.calculateDamageOnDemand).not.toHaveBeenCalled()
  })

  it('rejects backtrack before loading assets or calculating the result', async () => {
    const plan = {
      accepted: false,
      rejectionReasons: ['estimated-memory'],
      warnings: [{ code: 'estimated-memory', severity: 'reject' }],
    }
    const dependencies = createDependencies({
      planCalculationRanges: vi.fn(() => plan),
    })
    const client = createCalculationClient(dependencies)
    const onRangePlan = vi.fn()

    await expect(client.calculateBacktrack({ dlois: '屍人' }, {
      onRangePlan,
    })).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(CalculationRangeError)
      expect(error.plan).toBe(plan)
      expect(error.rejectionReasons).toBe(plan.rejectionReasons)
      return true
    })

    expect(onRangePlan).toHaveBeenCalledTimes(1)
    expect(onRangePlan).toHaveBeenCalledWith(plan)
    expect(dependencies.loadD10Asset).not.toHaveBeenCalled()
    expect(dependencies.loadLivingdeadAsset).not.toHaveBeenCalled()
    expect(dependencies.getFinalEncroachment).not.toHaveBeenCalled()
  })

  it('does not add DX planning cost for a fixed-value evasion reaction', () => {
    const client = createCalculationClient(createDependencies())
    const params = attackParams()
    params.reaction.score = {
      ...params.reaction.score,
      dice: 99,
      critical: 2,
      shihai: 19,
      yousei: 9,
    }

    const plan = client.planAttackCombo(params)

    expect(plan.scores[1].params).toEqual({
      dice: 0,
      critical: 11,
      skill: scoreParams.skill,
      yousei: 0,
      shihai: 0,
    })
    expect(plan.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'incompatible-input' })
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

  it('passes action and reaction score plans in order and keys DX cache by length', async () => {
    const plans = [
      {
        accepted: true,
        scores: [
          { workingLength: 3000, fftLength: 8192 },
          { workingLength: 3000, fftLength: 8192 },
        ],
      },
      {
        accepted: true,
        scores: [
          { workingLength: 3000, fftLength: 8192 },
          { workingLength: 3000, fftLength: 8192 },
        ],
      },
      {
        accepted: true,
        scores: [
          { workingLength: 3072, fftLength: 8192 },
          { workingLength: 3072, fftLength: 8192 },
        ],
      },
    ]
    let planIndex = 0
    const planCalculationRanges = vi.fn(() => plans[planIndex++])
    const calculateDxDistribution = vi.fn(
      (_params, options) => new Float64Array(options?.workingLength ?? 2048)
    )
    const calculateScore = vi.fn((params, getDxDistribution, fix, plan) => {
      if (!fix) {
        getDxDistribution(
          params.shihai,
          params.dice,
          params.critical,
          {
            workingLength: plan.workingLength,
            rounding: 'unrounded',
          }
        )
      }
      return { params, fix }
    })
    const dependencies = createDependencies({
      calculateDxDistribution,
      calculateScore,
      planCalculationRanges,
    })
    const client = createCalculationClient(dependencies)
    const params = {
      action: { ...scoreParams, dice: 20, critical: 7, shihai: 3 },
      reaction: { ...scoreParams, dice: 20, critical: 7, shihai: 3 },
    }

    await client.calculateCheck(params, { opposed: true, target: 0 })
    await client.calculateCheck(params, { opposed: true, target: 0 })
    await client.calculateCheck(params, { opposed: true, target: 0 })

    expect(calculateScore).toHaveBeenCalledTimes(6)
    expect(calculateScore.mock.calls[0][3]).toBe(plans[0].scores[0])
    expect(calculateScore.mock.calls[1][3]).toBe(plans[0].scores[1])
    expect(calculateScore.mock.calls[2][3]).toBe(plans[1].scores[0])
    expect(calculateScore.mock.calls[3][3]).toBe(plans[1].scores[1])
    expect(calculateScore.mock.calls[4][3]).toBe(plans[2].scores[0])
    expect(calculateScore.mock.calls[5][3]).toBe(plans[2].scores[1])
    expect(calculateDxDistribution).toHaveBeenCalledTimes(2)
    expect(calculateDxDistribution).toHaveBeenNthCalledWith(
      1,
      { dice: 20, critical: 7, shihai: 3 },
      { workingLength: 3000, rounding: 'unrounded' }
    )
    expect(calculateDxDistribution).toHaveBeenNthCalledWith(
      2,
      { dice: 20, critical: 7, shihai: 3 },
      { workingLength: 3072, rounding: 'unrounded' }
    )
  })

  it('normalizes runtime DX cache rounding aliases and default length', async () => {
    const requests = [
      { workingLength: 3000, rounding: 'unrounded' },
      { size: 3000, roundingMode: 'full-precision' },
      { workingLength: 3000 },
      { workingLength: 3000, rounding: 'legacy' },
      undefined,
      {},
      { rounding: 'compatibility' },
      { size: 3000, rounding: 'six-decimal' },
    ]
    const planCalculationRanges = vi.fn(() => ({
      accepted: true,
      scores: [
        { workingLength: 3000, fftLength: 8192 },
        { workingLength: 3000, fftLength: 8192 },
      ],
    }))
    const calculateDxDistribution = vi.fn(
      (_params, options) => new Float64Array(options?.workingLength ?? 2048)
    )
    let requestIndex = 0
    const calculateScore = vi.fn((_params, getDxDistribution) => {
      getDxDistribution(
        0,
        20,
        7,
        requests[requestIndex++]
      )
      return {}
    })
    const client = createCalculationClient(createDependencies({
      calculateDxDistribution,
      calculateScore,
      planCalculationRanges,
    }))
    const params = {
      action: { ...scoreParams },
      reaction: { ...scoreParams },
    }

    await client.calculateCheck(params, { opposed: true, target: 0 })
    await client.calculateCheck(params, { opposed: true, target: 0 })
    await client.calculateCheck(params, { opposed: true, target: 0 })
    await client.calculateCheck(params, { opposed: true, target: 0 })

    expect(calculateDxDistribution).toHaveBeenCalledTimes(3)
    expect(calculateDxDistribution).toHaveBeenNthCalledWith(
      1,
      { dice: 20, critical: 7, shihai: 0 },
      { workingLength: 3000, rounding: 'unrounded' }
    )
    expect(calculateDxDistribution).toHaveBeenNthCalledWith(
      2,
      { dice: 20, critical: 7, shihai: 0 },
      { workingLength: 3000, rounding: 'legacy' }
    )
    expect(calculateDxDistribution).toHaveBeenNthCalledWith(
      3,
      { dice: 20, critical: 7, shihai: 0 }
    )
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
      getDamageRollDistribution: vi.fn(async (_weights, _kazanari, providerOptions) => {
        const distribution = new Float64Array(
          providerOptions?.distributionLength ?? 2048
        )
        distribution[0] = 1
        return distribution
      }),
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
    expect(passedOptions).toMatchObject({
      requestId: 'combo-2',
      fftLength: 2048,
      distributionLength: 1024,
      rawSupportMax: 1030,
    })
    expect(passedOptions).not.toBe(options)
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
    const onRangePlan = vi.fn()
    const params = { dlois }

    await expect(client.calculateBacktrack(params, { onRangePlan }))
      .resolves.toBe('backtrack')

    expect(onRangePlan).toHaveBeenCalledTimes(1)
    expect(onRangePlan.mock.calls[0][0].operation).toBe('backtrack')
    expect(dependencies[loader]).toHaveBeenCalledOnce()
    expect(dependencies.getFinalEncroachment).toHaveBeenCalledWith(params)
  })
})
