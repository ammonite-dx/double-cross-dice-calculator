import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function importsFrom(path) {
  const matches = source(path).matchAll(
    /\bimport\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g
  )
  return Array.from(matches, (match) => match[1])
}

describe('calculation core planning boundaries', () => {
  it('keeps the RangePlanner as a thin orchestration façade', () => {
    const planner = source('src/calculation/RangePlanner.ts')

    for (const moduleName of [
      'BacktrackRangePlanner',
      'DamageRangePlanner',
      'ScoreRangePlanner',
      'ResourcePlan',
      'RangePolicy',
      'PlanningMath',
    ]) {
      expect(planner).toContain(`./planning/${moduleName}`)
    }
    expect(planner).not.toMatch(/export function (scoreTailBound|findTailCutoff)/)
    expect(planner).not.toMatch(/function (planScore|planDamage|planBacktrack)/)
    expect(planner).not.toMatch(/function (planResources|applyLimits)/)
  })

  it('keeps score and DX calculators independent from the planner façade', () => {
    expect(importsFrom('src/calculation/ScoreCalculator.ts'))
      .not.toContain('./RangePlanner')
    expect(importsFrom('src/calculation/DxCalculator.ts'))
      .not.toContain('./RangePlanner')

    for (const path of [
      'src/calculation/planning/ScoreRangePlanner.ts',
      'src/calculation/planning/DamageRangePlanner.ts',
      'src/calculation/planning/BacktrackRangePlanner.ts',
      'src/calculation/planning/ResourcePlan.ts',
      'src/calculation/planning/RangePolicy.ts',
      'src/calculation/planning/PlanningMath.ts',
    ]) {
      expect(
        importsFrom(path).some((specifier) =>
          /(?:^|\/)RangePlanner(?:\.js)?$/.test(specifier)
        ),
        path,
      ).toBe(false)
    }
  })

  it('centralizes planning arithmetic and the DX tail model', () => {
    const math = source('src/calculation/planning/PlanningMath.ts')
    const tail = source('src/calculation/DxTailModel.ts')
    const scoreTail = source('src/calculation/ScoreTailModel.ts')
    const rangePlanner = source('src/calculation/RangePlanner.ts')

    expect(math).toContain('export function nextPowerOfTwo')
    expect(math).toContain('export function fftOperationCount')
    expect(tail).toContain("from './DxOneDieModel'")
    expect(scoreTail).toContain('export function scoreTailBound')
    expect(scoreTail).toContain('calculateDxOrderStatisticTail')
    expect(rangePlanner).not.toContain('oneDieTail')
    expect(rangePlanner).not.toContain('maxTailBound')
  })

  it('keeps shihai order-statistic work in a shared low-level helper', () => {
    const calculator = source('src/calculation/DxCalculator.ts')
    const planner = source('src/calculation/planning/ScoreRangePlanner.ts')
    const orderStatistic = source('src/calculation/DxOrderStatistic.ts')

    expect(importsFrom('src/calculation/DxCalculator.ts'))
      .toContain('./DxOrderStatistic')
    expect(importsFrom('src/calculation/planning/ScoreRangePlanner.ts'))
      .toContain('../DxOrderStatistic')
    for (const retiredOwner of [
      'binomialProbabilities',
      'getTerminalOrderStatistic',
      'addShifted',
      'solveSelfTransition',
      'resultByDice',
      'criticalCounts',
      'transitionCount',
      'allCriticalProbability',
    ]) {
      expect(calculator).not.toContain(retiredOwner)
    }
    expect(orderStatistic).not.toMatch(/from ['"].*(?:runtime|features|presentation|tooling)/)
    expect(orderStatistic).not.toContain('RangePlanner')
    expect(planner).not.toContain('../DxCalculator')
  })

  it('keeps score production, outcome semantics, and statistics separate', () => {
    const scoreCalculator = source('src/calculation/ScoreCalculator.ts')
    const scoreOutcome = source('src/calculation/ScoreOutcome.ts')
    const scoreStatistics = source('src/calculation/ScoreStatistics.ts')

    expect(scoreCalculator).not.toMatch(/export function (getScoreStatistics|getScoreOutcomePartition|calculateScoreSuccessProbability)/)
    expect(scoreOutcome).not.toMatch(/from ['"].*ScoreCalculator['"]|export function calculateScore\b/)
    expect(scoreStatistics).not.toMatch(/DamageCalculator|DamageStatistics|DamageRollRequest/)
  })

  it('keeps damage request and statistics boundaries explicit', () => {
    const damageCalculator = source('src/calculation/DamageCalculator.ts')
    const damageStatistics = source('src/calculation/DamageStatistics.ts')
    const distributionResult = source('src/calculation/DistributionResult.ts')

    expect(damageCalculator).not.toMatch(/ScoreCalculator/)
    expect(damageCalculator).not.toMatch(/function getDamageStatistics/)
    expect(damageCalculator).toContain('./DamageRollRequest')
    expect(damageCalculator).toContain('./DamageExpectationCertificate')
    expect(damageStatistics).not.toMatch(/ScoreCalculator/)
    expect(distributionResult).not.toMatch(/DamageExpectationCertificate|getTotalDamageStatistics/)
  })

  it('shares DX working-shape rules without a planner-to-calculator import', () => {
    const planner = source('src/calculation/planning/ScoreRangePlanner.ts')
    const dxCalculator = source('src/calculation/DxCalculator.ts')
    const workingShape = source('src/calculation/DxWorkingShape.ts')

    expect(planner).toContain('../DxWorkingShape')
    expect(planner).not.toContain('../DxCalculator')
    expect(dxCalculator).toContain('./DxWorkingShape')
    expect(workingShape).toContain('getDxYouseiBlockLength')
    expect(workingShape).toContain('getDxYouseiFftLength')
  })

  it('keeps damage aggregation execution responsibilities in dedicated modules', () => {
    const facade = source('src/calculation/DamageAggregation.ts')
    expect(facade).toContain('./DamageAggregationCommon')
    expect(facade).toContain('./DamageAggregationInspection')
    expect(facade).toContain('./DamageAggregationPlanner')
    expect(facade).toContain('./DamageAggregationExecutor')

    const planner = source('src/calculation/DamageAggregationPlanner.ts')
    expect(planner).toContain('buildDamageAggregationPlan')
    expect(planner).toContain('getConvolutionFftLength')
    expect(planner).not.toContain('convolveDistributions')

    const executor = source('src/calculation/DamageAggregationExecutor.ts')
    expect(executor).toContain('executePreparedDamageAggregation')
    expect(executor).toContain('convolveDistributions')
    expect(executor).toContain('./DamageAggregationMetadata')
  })

  it('prevents execution and planning dependencies from crossing ownership boundaries', () => {
    const metadata = 'src/calculation/DamageAggregationMetadata.ts'
    const executor = 'src/calculation/DamageAggregationExecutor.ts'
    const planner = 'src/calculation/DamageAggregationPlanner.ts'

    expect(importsFrom(metadata)).not.toContain('../core/probability/FFT')
    expect(importsFrom(metadata)).not.toContain('./DamageAggregationExecutor')
    expect(importsFrom(executor)).not.toContain('./DamageAggregationPlanner')
    expect(source(executor)).not.toMatch(/\binspectEnvelope\b/)
    expect(source(planner)).not.toContain('convolveDistributions')

  })

  it('keeps Backtrack generation and plan validation outside the orchestrator', () => {
    const calculator = source('src/calculation/BacktrackCalculator.ts')
    expect(calculator).toContain('./BacktrackDistributionGenerator')
    expect(calculator).toContain('./BacktrackPlanValidation')
    expect(calculator).toContain('generateBacktrackDistributions')

    const generator = source('src/calculation/BacktrackDistributionGenerator.ts')
    expect(generator).toContain('calculateSharedD10Distributions')
    expect(generator).toContain('./BacktrackLivingdeadDistribution')
    const livingdead = source('src/calculation/BacktrackLivingdeadDistribution.ts')
    expect(livingdead).toContain('states[max][value]')
    expect(livingdead).toContain('calculateLivingdeadDistributions')
    const livingdeadImports = importsFrom(
      'src/calculation/BacktrackLivingdeadDistribution.ts'
    )
    for (const forbidden of [
      '../runtime',
      '../features',
      '../presentation',
      '../tooling',
      'RangePlanner',
    ]) {
      expect(livingdeadImports.some((specifier) => specifier.includes(forbidden)))
        .toBe(false)
    }

    const validation = source('src/calculation/BacktrackPlanValidation.ts')
    expect(validation).toContain('validateBacktrackRangePlan')
    expect(validation).toContain('generationOperations')

    const rangePlannerImports = importsFrom(
      'src/calculation/planning/BacktrackRangePlanner.ts'
    )
    for (const forbidden of [
      'BacktrackDistributionGenerator',
      'BacktrackLivingdeadDistribution',
      'BacktrackPlanValidation',
      'BacktrackCalculator',
    ]) {
      expect(rangePlannerImports.some((specifier) => specifier.includes(forbidden)))
        .toBe(false)
    }
  })
})
