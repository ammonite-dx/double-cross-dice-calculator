import { describe, expect, it, vi } from 'vitest'

import {
  ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS,
  createAttackCanonicalDisplayPresentation,
  createAttackCanonicalDisplayPresentationFromCanonical,
} from '../src/application/AttackCanonicalPresentation'
import {
  createCalculationClient,
} from '../src/application/CalculationClient'
import { createAttackCanonicalRunner } from '../src/application/AttackCanonicalRunner'
import {
  createCanonicalAttackState,
  createCanonicalComboDataState,
} from '../src/application/AttackCanonicalState'
import {
  ATTACK_DISPLAY_MODES,
} from '../src/application/AttackDisplayRequestSnapshot'
import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import {
  getCanonicalDamageSummary,
} from '../src/calculation/DamageCalculator'
import {
  calculateDxDistribution,
} from '../src/calculation/DxCalculator'
import {
  calculateCanonicalScoreSuccessProbabilityInterval,
  calculateCanonicalScoreSuccessProbability,
} from '../src/calculation/ScoreCalculator'
import {
  calculateScore,
  calculateScoreCanonical,
} from '../src/data/ScoreCalculator'
import { sumCanonicalDamage } from '../src/calculation/CanonicalDamageAggregation'
import {
  getCanonicalAttackScoreChartData,
} from '../src/components/Attack/ChartSetter'
import {
  CANONICAL_SUMMARY_UNAVAILABLE,
  formatCanonicalSummaryExpectedValue,
  formatCanonicalScoreSuccessRate,
  formatCanonicalScoreSummaryExpectedValue,
  getCanonicalScoreSummaryForCombo,
} from '../src/components/Attack/SummaryTable'

function createEnvelope(values, supportMax = values.length - 1) {
  return {
    result: createDistributionResult({
      values,
      offset: 0,
      support: { kind: 'finite', max: supportMax },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      sourceSupport: { kind: 'finite', max: supportMax },
      failureProbability: 0,
    },
  }
}

function createTailEnvelope(
  values,
  lowerBound,
  probability,
  {
    kind = 'exact',
    errorBound = 0,
    probabilityUpperBound,
    plannedTailBound,
  } = {}
) {
  const overflow = kind === 'upper-bound'
    ? {
        kind,
        lowerBound,
        probabilityUpperBound: probabilityUpperBound ?? probability,
        errorBound,
      }
    : {
        kind,
        lowerBound,
        probability,
        errorBound,
      }
  const result = createDistributionResult({
    values,
    offset: 0,
    support: { kind: 'infinite' },
    overflow,
  })
  const storedUpperBound = kind === 'upper-bound'
    ? probabilityUpperBound ?? probability
    : probability
  const potentialZeroTail = storedUpperBound === 0 && errorBound > 0
  const massUpperBound = potentialZeroTail
    ? plannedTailBound ?? 0
    : storedUpperBound
  return {
    result,
    metadata: {
      modeledDistribution: true,
      scoreTailCertificate: {
        version: 1,
        kind: 'canonical-score-tail-certificate',
        massLowerBound: kind === 'upper-bound' ? 0 : probability,
        massUpperBound,
        lowerBound,
        probabilityErrorBound: errorBound,
      },
    },
  }
}

function createBatch(scoreAction, scoreReaction = scoreAction) {
  const damage = createEnvelope([1], 0)
  const total = sumCanonicalDamage([damage])
  return {
    combos: [{
      id: 0,
      score: {
        action: scoreAction,
        reaction: scoreReaction,
      },
      scoreSummary: {
        action: { expectedValue: 123, successRate: 45.6 },
        reaction: { expectedValue: 456, successRate: 54.4 },
      },
      canonicalDamage: damage,
      canonicalDamageSummary: getCanonicalDamageSummary(damage),
    }],
    canonicalTotalDamage: total,
    canonicalTotalDamageSummary: getCanonicalTotalDamageSummary(total),
  }
}

const plan = { operation: 'attack', warnings: [] }
const attackData = {
  combos: [{ id: 0, name: 'コンボ1' }],
}

describe('Attack canonical score display adapter', () => {
  it('uses the production canonical score producer at the public batch boundary', async () => {
    const damage = createEnvelope([1], 0)
    const rangePlans = []
    const legacyScore = vi.fn((...args) => calculateScore(...args))
    const client = createCalculationClient({
      calculateCanonicalDamageOnDemand: vi.fn(async (score) => {
        expect(score.action.distribution).toBeInstanceOf(Float64Array)
        expect(score.reaction.distribution).toBeInstanceOf(Float64Array)
        return damage
      }),
      calculateDxDistribution,
      calculateScore: legacyScore,
      calculateScoreCanonical,
      getCanonicalDamageSummary,
      getCanonicalTotalDamageSummary,
      getDamageRollDistribution: vi.fn(),
      getD10Distribution: vi.fn(),
      loadD10Asset: vi.fn(async () => {}),
      planCalculationRanges: vi.fn(() => ({
        accepted: true,
        operation: 'attack',
        propagation: { score: 'published-bucket' },
        scores: [
          { workingLength: 16, fftLength: 16, tail: {} },
          { workingLength: 16, fftLength: 16, tail: {} },
        ],
        damage: {
          scoreValueMode: 'published-bucket',
          fixedDifference: 0,
          rawSupportMax: 0,
          workingMax: 0,
          workingLength: 2,
          defenceMax: 0,
          fftLength: 2,
          defenceFftLength: 2,
        },
      })),
      resourceGuard: {
        acquirePlan: vi.fn(() => ({ release: vi.fn() })),
      },
      sumCanonicalDamage,
    })

    const result = await client.calculateAttackCanonicalBatch([
      {
        id: 'production-combo',
        params: {
          action: {
            score: { dice: 0, critical: 11, skill: 3, yousei: 0, shihai: 0 },
            damage: { dice: 0, value: 0, kazanari: 0 },
          },
          reaction: {
            mode: 'ドッジ',
            score: { dice: 0, critical: 11, skill: 1, yousei: 0, shihai: 0 },
            damage: { dice: 0, value: 0 },
          },
        },
      },
    ], { onRangePlan: (plan) => rangePlans.push(plan) })

    expect(result.combos[0].score.action.result).toBeDefined()
    expect(result.combos[0].score.action.metadata.modeledDistribution)
      .toBe(true)
    expect(legacyScore).not.toHaveBeenCalled()
    expect(result.combos[0].scoreSummary.action.expectedValue).toEqual({
      kind: 'exact',
      value: 0,
    })

    const presentation = createAttackCanonicalDisplayPresentation(result, {
      displayRequest: { min: 0, max: 0, mode: ATTACK_DISPLAY_MODES.PMF },
      scoreDisplayRequest: { min: 0, max: 3, mode: ATTACK_DISPLAY_MODES.PMF },
      rangePlans,
    })
    const chart = getCanonicalAttackScoreChartData(presentation, {
      combos: [{ id: 'production-combo', name: 'コンボ1' }],
    })

    expect(presentation.score.status).toBe('ready')
    expect(chart).not.toBeNull()
    expect(chart.datasets[0].data).toEqual([100, 0, 0, 0])
  })

  it('reaches ready Score coverage through the production calculation client after expansion', async () => {
    const damage = createEnvelope([1], 0)
    const planningPolicies = []
    const client = createCalculationClient({
      calculateCanonicalDamageOnDemand: vi.fn(async () => damage),
      calculateDxDistribution,
      calculateScore: vi.fn((...args) => calculateScore(...args)),
      calculateScoreCanonical,
      getCanonicalDamageSummary,
      getCanonicalTotalDamageSummary,
      getDamageRollDistribution: vi.fn(),
      getD10Distribution: vi.fn(),
      loadD10Asset: vi.fn(async () => {}),
      planCalculationRanges: vi.fn((_params, policy = {}) => {
        planningPolicies.push(policy)
        const calculationMax = policy.calculationMax ?? 1
        return {
          accepted: true,
          operation: 'attack',
          propagation: { score: 'published-bucket' },
          scores: [
            { workingLength: calculationMax + 2, fftLength: 0, tail: {} },
            { workingLength: calculationMax + 2, fftLength: 0, tail: {} },
          ],
          damage: {
            scoreValueMode: 'published-bucket',
            fixedDifference: 0,
            rawSupportMax: 0,
            workingMax: 0,
            workingLength: 2,
            defenceMax: 0,
            fftLength: 2,
            defenceFftLength: 2,
          },
        }
      }),
      resourceGuard: {
        acquirePlan: vi.fn(() => ({ release: vi.fn() })),
      },
      sumCanonicalDamage,
    })
    const state = {
      ...createCanonicalAttackState(),
      canonicalOptIn: true,
      combos: [{
        id: 'production-score-expansion',
        data: {
          params: {
            action: {
              score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
              damage: { dice: 0, value: 0, kazanari: 0 },
            },
            reaction: {
              mode: 'ドッジ',
              score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
              damage: { dice: 0, value: 0 },
            },
          },
          ...createCanonicalComboDataState(),
        },
      }],
    }
    const damageRequest = {
      min: 0,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const initialScoreRequest = {
      min: 0,
      max: 1022,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const expandedScoreRequest = {
      min: 0,
      max: 1025,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const createSource = (currentState) => ({
      combos: currentState.combos.map((combo) => ({
        id: combo.id,
        canonicalScore: combo.data.canonicalScore,
        canonicalScoreSummary: combo.data.canonicalScoreSummary,
        canonicalScoreBatchSummary: combo.data.canonicalScoreBatchSummary,
        canonicalScorePresentation: combo.data.canonicalScorePresentation,
        canonicalDamagePresentation:
          combo.data.canonicalDamagePresentation,
        canonicalRangePlan: combo.data.canonicalRangePlan,
      })),
      canonicalTotalDamagePresentation:
        currentState.canonicalTotalDamagePresentation,
    })
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient: client,
      createPresentation: (batchResult, rangePlans, request, scoreRequest) =>
        createAttackCanonicalDisplayPresentation(batchResult, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest ?? initialScoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({
        state: currentState,
        displayRequest,
        scoreDisplayRequest,
      }) => createAttackCanonicalDisplayPresentationFromCanonical(
        createSource(currentState),
        {
          displayRequest: displayRequest ?? damageRequest,
          scoreDisplayRequest: scoreDisplayRequest ?? initialScoreRequest,
        }
      ),
    })

    await expect(runner.run({
      displayRequest: damageRequest,
      scoreDisplayRequest: initialScoreRequest,
      rangePolicy: { calculationMax: 1022 },
    })).resolves.toBe(true)
    expect(state.canonicalScoreDisplayPresentation.status).toBe('ready')

    await expect(runner.refreshPresentation({
      displayRequest: damageRequest,
      scoreDisplayRequest: expandedScoreRequest,
      scoreOnly: true,
      calculationOptions: { rangePolicy: { calculationMax: 1025 } },
    })).resolves.toBe(true)

    expect(planningPolicies).toEqual([
      { calculationMax: 1022 },
      { calculationMax: 1025 },
    ])
    expect(state.canonicalScoreDisplayPresentation.status).toBe('ready')
    expect(state.canonicalScoreDisplayPresentation.displayRequest)
      .toEqual(expandedScoreRequest)
  })

  it('projects the action side with one-decimal percentages and keeps reaction atomic', () => {
    const score = createEnvelope([0.12345, 0.87655], 1)
    const presentation = createAttackCanonicalDisplayPresentation(
      createBatch(score),
      {
        displayRequest: { min: 0, max: 0, mode: ATTACK_DISPLAY_MODES.PMF },
        scoreDisplayRequest: { min: 0, max: 1, mode: ATTACK_DISPLAY_MODES.PMF },
        rangePlans: [plan],
      }
    )

    expect(presentation.status).toBe('ready')
    expect(presentation.score.status).toBe('ready')
    expect(presentation.score.combos[0].action.chart.labels).toEqual([0, 1])
    expect(Array.from(presentation.score.combos[0].action.series.values))
      .toEqual([0.12345, 0.87655])

    const chart = getCanonicalAttackScoreChartData(presentation, attackData)
    expect(chart.labels).toEqual([0, 1])
    expect(chart.datasets[0].data).toEqual([12.3, 87.7])
    expect(chart.datasets[0].data)
      .not.toBe(presentation.score.combos[0].action.chart.datasets[0].data)
  })

  it('reports score coverage as not-ready without changing the Damage decision', () => {
    const score = createEnvelope([0.5, 0.5], 4)
    const presentation = createAttackCanonicalDisplayPresentation(
      createBatch(score),
      {
        displayRequest: { min: 0, max: 0, mode: ATTACK_DISPLAY_MODES.PMF },
        scoreDisplayRequest: { min: 0, max: 4, mode: ATTACK_DISPLAY_MODES.PMF },
        rangePlans: [plan],
      }
    )

    expect(presentation.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.REUSE)
    expect(presentation.score.status).toBe('not-ready')
    expect(presentation.score.decision)
      .toBe(ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE)
    expect(getCanonicalAttackScoreChartData(presentation, attackData))
      .toBeNull()
  })

  it('does not pointify non-exact score summaries', () => {
    expect(formatCanonicalSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 1,
      upperBound: 2,
    })).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
    expect(formatCanonicalSummaryExpectedValue({
      kind: 'lower-bound',
      lowerBound: 1,
    })).toBe(CANONICAL_SUMMARY_UNAVAILABLE)
  })

  it('uses only the atomic canonical batch Score summary for summary cells', () => {
    const summary = {
      action: {
        expectedValue: { kind: 'exact', value: 12.34 },
        successRate: { kind: 'exact', value: 56.7 },
      },
      reaction: {
        expectedValue: { kind: 'exact', value: 7 },
        successRate: { kind: 'exact', value: 43.3 },
      },
    }
    const scorePresentation = {
      status: 'ready',
      combos: [{
        id: 0,
        canonicalScoreBatchSummary: summary,
        action: {
          display: {
            expectedValue: { kind: 'exact', value: 999 },
          },
        },
      }],
    }

    expect(getCanonicalScoreSummaryForCombo(scorePresentation, 0))
      .toBe(summary)
    expect(formatCanonicalScoreSummaryExpectedValue(
      summary.action.expectedValue
    )).toBe(12.3)
    expect(formatCanonicalScoreSuccessRate(summary.action.successRate))
      .toBe(56.7)
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 1,
      upperBound: 2,
    })).toBe('—')
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'lower-bound',
      lowerBound: 1,
    })).toBe('—')
    expect(formatCanonicalScoreSuccessRate({
      kind: 'bounded',
      lowerBound: 0,
      upperBound: 100,
    })).toBe('—')
    expect(formatCanonicalScoreSuccessRate({
      kind: 'lower-bound',
      lowerBound: 0,
    })).toBe('—')
  })

  it('displays bounded Score values only when both rounded bounds agree', () => {
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 6.011111,
      upperBound: 6.011112,
    })).toBe(6)
    expect(formatCanonicalScoreSuccessRate({
      kind: 'bounded',
      lowerBound: 45.4545,
      upperBound: 45.4546,
    })).toBe(45.5)
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 6.04,
      upperBound: 6.06,
    })).toBe('—')
    expect(formatCanonicalScoreSuccessRate({
      kind: 'bounded',
      lowerBound: 45.04,
      upperBound: 45.06,
    })).toBe('—')
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 6.05,
      upperBound: 6.05,
    })).toBe(6.1)
    expect(formatCanonicalScoreSuccessRate({
      kind: 'bounded',
      lowerBound: 45.05,
      upperBound: 45.05,
    })).toBe(45.1)
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: 6.049999999,
      upperBound: 6.05,
    })).toBe('—')
    expect(formatCanonicalScoreSuccessRate({
      kind: 'bounded',
      lowerBound: 45.049999999,
      upperBound: 45.05,
    })).toBe('—')
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'bounded',
      lowerBound: -0.05,
      upperBound: -0.05,
    })).toBe(0)
    expect(formatCanonicalScoreSummaryExpectedValue({
      kind: 'exact',
      value: 6.04,
    })).toBe(6)
  })

  it('keeps the four success interval event classes disjoint', () => {
    const action = createTailEnvelope([0.1, 0, 0, 0, 0, 0.2], 10, 0.7)
    const reaction = createTailEnvelope([0.15], 4, 0.85)
    const interval = calculateCanonicalScoreSuccessProbabilityInterval(
      action,
      reaction
    )

    // P00=.2*.15, AT*R0=.7*.15, A0*RT=.2*.85, AT*RT=.7*.85.
    expect(interval.lowerBound).toBeCloseTo(0.135, 7)
    expect(interval.upperBound).toBeCloseTo(0.9, 7)
  })

  it('keeps finite/no-tail and tail-mass-zero cases exact', () => {
    const finiteAction = createEnvelope([0, 1], 1)
    const finiteReaction = createEnvelope([1], 0)
    const finiteInterval = calculateCanonicalScoreSuccessProbabilityInterval(
      finiteAction,
      finiteReaction
    )
    expect(finiteInterval.lowerBound).toBeCloseTo(1, 12)
    expect(finiteInterval.upperBound).toBeCloseTo(1, 12)

    const zeroTail = createTailEnvelope([0.25, 0.25], 2, 0.5)
    const zeroTailCertificate = {
      ...zeroTail,
      result: createDistributionResult({
        values: [0.75, 0.25],
        offset: 0,
        support: { kind: 'infinite' },
        overflow: {
          kind: 'exact',
          lowerBound: 2,
          probability: 0,
          errorBound: 0,
        },
      }),
      metadata: {
        modeledDistribution: true,
        scoreTailCertificate: {
          version: 1,
          kind: 'canonical-score-tail-certificate',
          massLowerBound: 0,
          massUpperBound: 0,
          lowerBound: 2,
          probabilityErrorBound: 0,
        },
      },
    }
    const exactInterval = calculateCanonicalScoreSuccessProbabilityInterval(
      zeroTailCertificate,
      finiteReaction
    )
    expect(exactInterval.lowerBound).toBeCloseTo(0.25, 12)
    expect(exactInterval.upperBound).toBeCloseTo(0.25, 12)
  })

  it('keeps zero-probability overflow with numeric error in the interval lane', () => {
    const finiteReaction = createEnvelope([0, 1], 1)
    const exactPotentialTail = createTailEnvelope(
      [1],
      2,
      0,
      { errorBound: 0.1, plannedTailBound: 0.1 }
    )
    const upperPotentialTail = createTailEnvelope(
      [1],
      2,
      0,
      { kind: 'upper-bound', errorBound: 0.1, plannedTailBound: 0.1 }
    )

    for (const action of [exactPotentialTail, upperPotentialTail]) {
      const interval = calculateCanonicalScoreSuccessProbabilityInterval(
        action,
        finiteReaction
      )
      expect(interval.lowerBound).toBe(0)
      expect(interval.upperBound).toBeGreaterThan(0)
      expect(action.metadata.scoreTailCertificate.massUpperBound)
        .toBeCloseTo(0.1, 12)
    }
  })

  it('recovers the default production canonical Attack summary values', async () => {
    const rangePlans = []
    const damage = createEnvelope([1], 0)
    const legacyScore = vi.fn((...args) => calculateScore(...args))
    const client = createCalculationClient({
      calculateCanonicalDamageOnDemand: vi.fn(async () => damage),
      calculateDxDistribution,
      calculateScore: legacyScore,
      calculateScoreCanonical,
      getCanonicalDamageSummary,
      getCanonicalTotalDamageSummary,
      getDamageRollDistribution: vi.fn(),
      getD10Distribution: vi.fn(),
      loadD10Asset: vi.fn(async () => {}),
      sumCanonicalDamage,
    })
    const result = await client.calculateAttackCanonicalBatch([
      {
        id: 'default-summary',
        params: {
          action: {
            score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
            damage: { dice: 0, value: 0, kazanari: 0 },
          },
          reaction: {
            mode: 'ドッジ',
            score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
            damage: { dice: 0, value: 0 },
          },
        },
      },
    ], { onRangePlan: (rangePlan) => rangePlans.push(rangePlan) })
    const presentation = createAttackCanonicalDisplayPresentation(result, {
      displayRequest: { min: 0, max: 0, mode: ATTACK_DISPLAY_MODES.PMF },
      scoreDisplayRequest: { min: 0, max: 100, mode: ATTACK_DISPLAY_MODES.PMF },
      rangePlans,
    })
    const summary = getCanonicalScoreSummaryForCombo(
      presentation.score,
      'default-summary'
    )

    expect(formatCanonicalScoreSummaryExpectedValue(
      summary.action.expectedValue
    )).toBe(6)
    expect(formatCanonicalScoreSuccessRate(summary.action.successRate))
      .toBe(45.5)
    expect(formatCanonicalScoreSuccessRate(summary.reaction.successRate))
      .toBe(54.5)
    expect(legacyScore).not.toHaveBeenCalled()
  })

  it('does not recalculate the canonical batch for a score-only coverage miss', async () => {
    const score = createEnvelope([0.5, 0.5], 4)
    const batch = createBatch(score)
    const state = {
      ...createCanonicalAttackState(),
      canonicalOptIn: true,
      combos: [{
        id: 0,
        data: {
          params: {
            action: {
              score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
              damage: { dice: 0, value: 0, kazanari: 0 },
            },
            reaction: {
              mode: 'ドッジ',
              score: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
              damage: { dice: 0, value: 0 },
            },
          },
          ...createCanonicalComboDataState(),
        },
      }],
    }
    const damageRequest = { min: 0, max: 0, mode: ATTACK_DISPLAY_MODES.PMF }
    const scoreRequest = { min: 0, max: 4, mode: ATTACK_DISPLAY_MODES.PMF }
    const source = (currentState) => ({
      combos: currentState.combos.map((combo) => ({
        id: combo.id,
        canonicalScore: combo.data.canonicalScore,
        canonicalScoreSummary: combo.data.canonicalScoreSummary,
        canonicalScoreBatchSummary: combo.data.canonicalScoreBatchSummary,
        canonicalScorePresentation: combo.data.canonicalScorePresentation,
        canonicalDamagePresentation: combo.data.canonicalDamagePresentation,
        canonicalRangePlan: combo.data.canonicalRangePlan,
      })),
      canonicalTotalDamagePresentation:
        currentState.canonicalTotalDamagePresentation,
    })
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan(plan)
        return batch
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation: (result, rangePlans, request) =>
        createAttackCanonicalDisplayPresentation(result, {
          displayRequest: request ?? damageRequest,
          scoreDisplayRequest: scoreRequest,
          rangePlans,
        }),
      createDisplayPresentation: ({ state: currentState, displayRequest }) =>
        createAttackCanonicalDisplayPresentationFromCanonical(
          source(currentState),
          {
            displayRequest: displayRequest ?? damageRequest,
            scoreDisplayRequest: scoreRequest,
          }
        ),
    })

    await expect(runner.run({ displayRequest: damageRequest })).resolves.toBe(true)
    expect(state.canonicalScoreDisplayPresentation.status).toBe('not-ready')
    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledOnce()

    expect(runner.refreshPresentation({
      displayRequest: damageRequest,
    })).toBe(true)
    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledOnce()
    expect(state.canonicalDisplayPresentation.status).toBe('ready')
    expect(getCanonicalScoreSummaryForCombo(
      state.canonicalScoreDisplayPresentation,
      0
    )).toBeNull()
    runner.dispose()
  })

  it('matches the expected strict score-success probability', () => {
    const actionBuckets = [
      { value: 1, probability: 0.25 },
      { value: 4, probability: 0.75 },
    ]
    const reactionBuckets = [
      { value: 0, probability: 0.5 },
      { value: 2, probability: 0.5 },
    ]
    const expected = actionBuckets.reduce(
      (sum, actionBucket) => sum + actionBucket.probability
        * reactionBuckets
          .filter((reactionBucket) => reactionBucket.value < actionBucket.value)
          .reduce((probability, reactionBucket) =>
            probability + reactionBucket.probability, 0),
      0
    )

    expect(calculateCanonicalScoreSuccessProbability(
      actionBuckets,
      reactionBuckets
    )).toBeCloseTo(expected)
  })

  it('keeps equal score buckets out of strict success', () => {
    expect(calculateCanonicalScoreSuccessProbability(
      [
        { value: 5, probability: 0.5 },
        { value: 6, probability: 0.5 },
      ],
      [{ value: 5, probability: 1 }]
    )).toBe(0.5)
  })

  it('walks sparse buckets with one cumulative reaction pointer', () => {
    expect(calculateCanonicalScoreSuccessProbability(
      [
        { value: 0, probability: 0.2 },
        { value: 10, probability: 0.8 },
      ],
      [
        { value: -5, probability: 0.25 },
        { value: 0, probability: 0.25 },
        { value: 7, probability: 0.5 },
      ]
    )).toBeCloseTo(0.85)
  })

  it('visits the long reaction bucket array linearly', () => {
    const bucketCount = 4096
    const probability = 1 / bucketCount
    const actionBuckets = Array.from(
      { length: bucketCount },
      (_, index) => ({ value: index * 2, probability })
    )
    const reactionBuckets = Array.from(
      { length: bucketCount },
      (_, index) => ({ value: index * 2, probability })
    )
    let reactionVisits = 0

    const actual = calculateCanonicalScoreSuccessProbability(
      actionBuckets,
      reactionBuckets,
      () => {
        reactionVisits += 1
      }
    )

    expect(reactionVisits).toBe(bucketCount - 1)
    expect(actual).toBeCloseTo((bucketCount - 1) / (2 * bucketCount), 12)
  })
})
