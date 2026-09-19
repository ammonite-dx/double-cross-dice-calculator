import { readFileSync, readdirSync } from 'node:fs'
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

function sourceTree(path) {
  let entries
  try {
    entries = readdirSync(new URL(`../${path}/`, import.meta.url), {
      withFileTypes: true,
    })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory()) {
      return sourceTree(child)
    }
    return /\.(?:js|ts)$/.test(entry.name) ? [source(child)] : []
  })
}

describe('calculation core planning boundaries', () => {
  it('keeps the RangePlanner as a thin orchestration façade', () => {
    const planner = source('src/calculation/RangePlanner.js')

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
    expect(source('src/calculation/ScoreCalculator.js'))
      .not.toMatch(/RangePlanner/)
    expect(source('src/calculation/DxCalculator.js'))
      .not.toMatch(/RangePlanner/)

    for (const path of [
      'src/calculation/planning/ScoreRangePlanner.js',
      'src/calculation/planning/DamageRangePlanner.js',
      'src/calculation/planning/BacktrackRangePlanner.js',
      'src/calculation/planning/ResourcePlan.js',
      'src/calculation/planning/RangePolicy.js',
      'src/calculation/planning/PlanningMath.js',
    ]) {
      expect(source(path), path).not.toMatch(/from ['"].*RangePlanner/)
    }
  })

  it('centralizes planning arithmetic and the DX tail model', () => {
    const math = source('src/calculation/planning/PlanningMath.js')
    const tail = source('src/calculation/DxTailModel.js')
    const rangePlanner = source('src/calculation/RangePlanner.js')

    expect(math).toContain('export function nextPowerOfTwo')
    expect(math).toContain('export function fftOperationCount')
    expect(tail).toContain('export function oneDieTail')
    expect(tail).toContain('export function scoreTailBound')
    expect(rangePlanner).not.toContain('oneDieTail')
    expect(rangePlanner).not.toContain('maxTailBound')
  })

  it('keeps score production, outcome semantics, and statistics separate', () => {
    const scoreCalculator = source('src/calculation/ScoreCalculator.js')
    const scoreOutcome = source('src/calculation/ScoreOutcome.ts')
    const scoreStatistics = source('src/calculation/ScoreStatistics.ts')

    expect(scoreCalculator).not.toMatch(/export function (getScoreStatistics|getScoreOutcomePartition|calculateScoreSuccessProbability)/)
    expect(scoreOutcome).not.toMatch(/from ['"].*ScoreCalculator['"]|export function calculateScore\b/)
    expect(scoreStatistics).not.toMatch(/DamageCalculator|DamageStatistics|DamageRollRequest/)
  })

  it('keeps damage request and statistics boundaries explicit', () => {
    const damageCalculator = source('src/calculation/DamageCalculator.js')
    const damageStatistics = source('src/calculation/DamageStatistics.ts')
    const distributionResult = source('src/calculation/DistributionResult.js')

    expect(damageCalculator).not.toMatch(/ScoreCalculator/)
    expect(damageCalculator).not.toMatch(/function getDamageStatistics/)
    expect(damageCalculator).toContain('./DamageRollRequest')
    expect(damageCalculator).toContain('./DamageExpectationCertificate')
    expect(damageStatistics).not.toMatch(/ScoreCalculator/)
    expect(distributionResult).not.toMatch(/DamageExpectationCertificate|getTotalDamageStatistics/)
  })

  it('shares DX working-shape rules without a planner-to-calculator import', () => {
    const planner = source('src/calculation/planning/ScoreRangePlanner.js')
    const dxCalculator = source('src/calculation/DxCalculator.js')
    const workingShape = source('src/calculation/DxWorkingShape.js')

    expect(planner).toContain('../DxWorkingShape')
    expect(planner).not.toContain('../DxCalculator')
    expect(dxCalculator).toContain('./DxWorkingShape')
    expect(workingShape).toContain('getDxYouseiBlockLength')
    expect(workingShape).toContain('getDxYouseiFftLength')
  })

  it('keeps damage aggregation execution responsibilities in dedicated modules', () => {
    const facade = source('src/calculation/DamageAggregation.js')
    expect(facade).toContain('./DamageAggregationCommon')
    expect(facade).toContain('./DamageAggregationInspection')
    expect(facade).toContain('./DamageAggregationPlanner')
    expect(facade).toContain('./DamageAggregationExecutor')
    expect(facade).toContain('./DamageAggregationPlanStore')

    const planner = source('src/calculation/DamageAggregationPlanner.js')
    expect(planner).toContain('buildDamageAggregationPlan')
    expect(planner).toContain('getConvolutionFftLength')
    expect(planner).not.toContain('convolveDistributions')

    const executor = source('src/calculation/DamageAggregationExecutor.js')
    expect(executor).toContain('executeDamageAggregationPlan')
    expect(executor).toContain('convolveDistributions')
    expect(executor).toContain('./DamageAggregationMetadata')
  })

  it('prevents execution and planning dependencies from crossing ownership boundaries', () => {
    const metadata = 'src/calculation/DamageAggregationMetadata.js'
    const executor = 'src/calculation/DamageAggregationExecutor.js'
    const planner = 'src/calculation/DamageAggregationPlanner.js'

    expect(importsFrom(metadata)).not.toContain('../core/probability/FFT')
    expect(importsFrom(metadata)).not.toContain('./DamageAggregationExecutor')
    expect(importsFrom(executor)).not.toContain('./DamageAggregationPlanner')
    expect(executor).not.toMatch(/\binspectEnvelope\b/)
    expect(source(planner)).not.toContain('convolveDistributions')

    const runtimeAndApplication = [
      ...sourceTree('src/runtime'),
      ...sourceTree('src/application'),
    ]
    runtimeAndApplication.forEach((moduleSource) => {
      expect(moduleSource).not.toContain('DamageAggregationPlanStore')
    })
  })

  it('keeps Backtrack generation and plan validation outside the orchestrator', () => {
    const calculator = source('src/calculation/BacktrackCalculator.js')
    expect(calculator).toContain('./BacktrackDistributionGenerator')
    expect(calculator).toContain('./BacktrackPlanValidation')
    expect(calculator).toContain('generateBacktrackDistributions')

    const generator = source('src/calculation/BacktrackDistributionGenerator.js')
    expect(generator).toContain('calculateSharedD10Distributions')
    expect(generator).toContain('./BacktrackLivingdeadDistribution')
    const livingdead = source('src/calculation/BacktrackLivingdeadDistribution.js')
    expect(livingdead).toContain('states[max][value]')
    expect(livingdead).toContain('calculateLivingdeadDistributions')
    const livingdeadImports = importsFrom(
      'src/calculation/BacktrackLivingdeadDistribution.js'
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

    const validation = source('src/calculation/BacktrackPlanValidation.js')
    expect(validation).toContain('validateBacktrackRangePlan')
    expect(validation).toContain('generationOperations')

    const rangePlannerImports = importsFrom(
      'src/calculation/planning/BacktrackRangePlanner.js'
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
