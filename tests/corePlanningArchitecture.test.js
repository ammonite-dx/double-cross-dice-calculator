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
})
