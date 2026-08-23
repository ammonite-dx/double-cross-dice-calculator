import { describe, expect, it } from 'vitest'

import {
  createAttackCanonicalDisplayPresentation,
} from '../src/application/AttackCanonicalPresentation'
import {
  createCalculationClient,
} from '../src/application/CalculationClient'
import {
  ATTACK_DISPLAY_MODES,
  createAttackRangePolicy,
} from '../src/application/AttackDisplayRequestSnapshot'
import {
  calculateCanonicalDamageOnDemand,
  calculateDamageOnDemand,
  getCanonicalDamageSummary,
} from '../src/calculation/DamageCalculator'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  compareLegacyAndCanonicalDamage,
  compareLegacyAndCanonicalTotalDamage,
} from '../src/calculation/LegacyCanonicalComparison'
import { toPublishedBucketDistribution } from '../src/calculation/DistributionResult'
import {
  getCanonicalAttackDamageChartData,
  getCanonicalAttackScoreChartData,
  getAttackDamageChartData,
  getAttackScoreChartData,
} from '../src/components/Attack/ChartSetter'
import {
  formatCanonicalSummaryExpectedValue,
  formatCanonicalScoreSuccessRate,
  formatCanonicalScoreSummaryExpectedValue,
  getCanonicalScoreSummaryForCombo,
} from '../src/components/Attack/SummaryTable'
import {
  getDamageSummary,
  getTotalDamage,
} from '../src/data/DamageCalculator'
import { getUpperTailProbability } from '../src/data/Distribution'
import {
  getD10Distribution,
  loadD10Asset,
  registerD10Asset,
} from '../src/data/PrecomputedDataRepository'
import {
  calculateScore,
  calculateScoreCanonical,
  getCanonicalScoreSummary,
  getScoreSummary,
} from '../src/data/ScoreCalculator'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import d10 from '../public/data/schema-v2/revision-1/d10.json'

registerD10Asset(d10)

const SCORE_PARAMS = Object.freeze({
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
})

const DISPLAY_REQUEST = Object.freeze({
  min: 0,
  max: 100,
  mode: ATTACK_DISPLAY_MODES.PMF,
})

const SCORE_MAX_ABSOLUTE_DIFFERENCE = 5e-6

const calculationClient = createCalculationClient({
  calculateCanonicalDamageOnDemand,
  calculateDamageOnDemand,
  calculateDxDistribution,
  calculateScore,
  calculateScoreCanonical,
  getCanonicalDamageSummary,
  getCanonicalScoreSummary,
  getD10Distribution,
  getDamageRollDistribution: generateMixedDamageDistribution,
  getDamageSummary,
  getScoreSummary,
  getTotalDamage,
  loadD10Asset,
})

function createEntries() {
  return [
    {
      id: 0,
      name: '正方向',
      params: {
        action: {
          score: { ...SCORE_PARAMS },
          damage: { dice: 0, value: 3, kazanari: 0 },
        },
        reaction: {
          mode: 'ドッジ',
          score: { ...SCORE_PARAMS },
          damage: { dice: 1, value: 1 },
        },
      },
    },
    {
      id: 1,
      name: '負方向・加算',
      params: {
        action: {
          score: { ...SCORE_PARAMS },
          damage: { dice: 0, value: -4, kazanari: 3 },
        },
        reaction: {
          mode: 'ドッジ',
          score: { ...SCORE_PARAMS },
          damage: { dice: 1, value: 5 },
        },
      },
    },
  ]
}

function createRangePolicy() {
  return createAttackRangePolicy(
    DISPLAY_REQUEST,
    { calculationMax: 1022 },
    DISPLAY_REQUEST
  )
}

function toPublishedScore(canonicalScore) {
  const distribution = toPublishedBucketDistribution(canonicalScore.result)
  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
    failureProbability: canonicalScore.metadata.failureProbability,
  }
}

function expectPublishedDistributionsToMatch(legacy, canonical) {
  expect(canonical.distribution).toHaveLength(legacy.distribution.length)
  expect(canonical.upperTailProbability)
    .toHaveLength(legacy.upperTailProbability.length)

  let distributionDifference = 0
  let upperTailDifference = 0
  for (let index = 0; index < legacy.distribution.length; index += 1) {
    distributionDifference = Math.max(
      distributionDifference,
      Math.abs(legacy.distribution[index] - canonical.distribution[index])
    )
    upperTailDifference = Math.max(
      upperTailDifference,
      Math.abs(
        legacy.upperTailProbability[index] -
          canonical.upperTailProbability[index]
      )
    )
  }

  expect(distributionDifference)
    .toBeLessThanOrEqual(SCORE_MAX_ABSOLUTE_DIFFERENCE)
  expect(upperTailDifference)
    .toBeLessThanOrEqual(SCORE_MAX_ABSOLUTE_DIFFERENCE)
  expect(canonical.failureProbability)
    .toBeCloseTo(legacy.failureProbability, 6)
}

function expectComparable(comparison, scope) {
  expect(comparison).toMatchObject({
    kind: 'comparable',
    passed: true,
    scope,
  })
  expect(comparison.maxAbsoluteDifference).toBeLessThanOrEqual(2e-6)
  expect(comparison.l1Difference).toBeLessThanOrEqual(2e-4)
  expect(comparison.massDifference).toBeLessThanOrEqual(1e-8)
}

function createLegacyAttackData(entries, legacyResults, legacyTotal) {
  return {
    combos: entries.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      data: legacyResults[index],
    })),
    totalDamageReady: true,
    totalDamage: legacyTotal.totalDamage,
    totalDamageSummary: legacyTotal.totalDamageSummary,
  }
}

function expectChartsToMatch(legacy, canonical) {
  expect(canonical.labels).toEqual(legacy.labels)
  expect(canonical.datasets).toHaveLength(legacy.datasets.length)
  for (let index = 0; index < legacy.datasets.length; index += 1) {
    expect(canonical.datasets[index]).toMatchObject({
      label: legacy.datasets[index].label,
      backgroundColor: legacy.datasets[index].backgroundColor,
      borderColor: legacy.datasets[index].borderColor,
      data: legacy.datasets[index].data,
    })
  }
}

function expectSummaryToMatch(entry, legacyResult, canonicalPresentation) {
  const canonicalScoreSummary = getCanonicalScoreSummaryForCombo(
    canonicalPresentation.score,
    entry.id
  )
  expect(canonicalScoreSummary).not.toBeNull()

  expect(formatCanonicalScoreSummaryExpectedValue(
    canonicalScoreSummary.action.expectedValue
  )).toBe(legacyResult.scoreSummary.action.expectedValue)
  expect(formatCanonicalScoreSuccessRate(
    canonicalScoreSummary.action.successRate
  )).toBe(legacyResult.scoreSummary.action.successRate)
  expect(formatCanonicalScoreSummaryExpectedValue(
    canonicalScoreSummary.reaction.expectedValue
  )).toBe(legacyResult.scoreSummary.reaction.expectedValue)
  expect(formatCanonicalScoreSuccessRate(
    canonicalScoreSummary.reaction.successRate
  )).toBe(legacyResult.scoreSummary.reaction.successRate)

  const canonicalCombo = canonicalPresentation.combos.find(
    (combo) => combo.id === entry.id
  )
  expect(formatCanonicalSummaryExpectedValue(
    canonicalCombo.display.expectedValue
  )).toBe(legacyResult.damageSummary.expectedValue)
}

describe('production Attack canonical/legacy comparison fixture', () => {
  it('matches ordered public legacy and canonical combo results through display boundaries', async () => {
    const entries = createEntries()
    const inputSnapshot = structuredClone(entries)
    const rangePlans = []

    const canonicalBatchPromise = calculationClient
      .calculateAttackCanonicalBatch(entries, {
        rangePolicy: createRangePolicy(),
        onRangePlan: (rangePlan) => rangePlans.push(rangePlan),
      })

    entries.reverse()
    entries[0].params.action.damage.value = 999

    const canonicalBatch = await canonicalBatchPromise
    expect(entries).not.toEqual(inputSnapshot)
    expect(canonicalBatch.combos.map((combo) => combo.id))
      .toEqual(inputSnapshot.map((entry) => entry.id))
    expect(rangePlans).toHaveLength(inputSnapshot.length)

    const legacyResults = []
    for (const entry of inputSnapshot) {
      legacyResults.push(
        await calculationClient.calculateAttackCombo(
          entry.params,
          { rangePolicy: createRangePolicy() }
        )
      )
    }
    const legacyTotal = await calculationClient.calculateTotalDamage(
      legacyResults.map((result) => ({ data: { damage: result.damage } }))
    )

    for (let index = 0; index < inputSnapshot.length; index += 1) {
      const legacy = legacyResults[index]
      const canonical = canonicalBatch.combos[index]
      expectPublishedDistributionsToMatch(
        legacy.score.action,
        toPublishedScore(canonical.score.action)
      )
      expectPublishedDistributionsToMatch(
        legacy.score.reaction,
        toPublishedScore(canonical.score.reaction)
      )

      expectComparable(
        compareLegacyAndCanonicalDamage(
          legacy.damage.distribution,
          canonical.canonicalDamage
        ),
        'damage'
      )
    }

    expectComparable(
      compareLegacyAndCanonicalTotalDamage(
        legacyTotal.totalDamage.distribution,
        canonicalBatch.canonicalTotalDamage
      ),
      'total'
    )

    const displayEntries = inputSnapshot.map(({ id, name }) => ({
      id,
      name,
    }))
    const legacyAttackData = createLegacyAttackData(
      displayEntries,
      legacyResults,
      legacyTotal
    )
    const canonicalPresentation = createAttackCanonicalDisplayPresentation(
      canonicalBatch,
      {
        displayRequest: DISPLAY_REQUEST,
        scoreDisplayRequest: DISPLAY_REQUEST,
        rangePlans,
      }
    )

    expect(canonicalPresentation.status).toBe('ready')
    expect(canonicalPresentation.score.status).toBe('ready')
    expectChartsToMatch(
      getAttackScoreChartData(legacyAttackData, DISPLAY_REQUEST),
      getCanonicalAttackScoreChartData(
        canonicalPresentation,
        { combos: displayEntries }
      )
    )
    expectChartsToMatch(
      getAttackDamageChartData(legacyAttackData, DISPLAY_REQUEST),
      getCanonicalAttackDamageChartData(
        canonicalPresentation,
        { combos: displayEntries }
      )
    )

    for (let index = 0; index < inputSnapshot.length; index += 1) {
      expectSummaryToMatch(
        inputSnapshot[index],
        legacyResults[index],
        canonicalPresentation
      )
    }
    expect(formatCanonicalSummaryExpectedValue(
      canonicalPresentation.total.display.expectedValue
    )).toBe(legacyTotal.totalDamageSummary.expectedValue)
  })
})
