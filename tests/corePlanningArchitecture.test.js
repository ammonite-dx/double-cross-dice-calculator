import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
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
})
