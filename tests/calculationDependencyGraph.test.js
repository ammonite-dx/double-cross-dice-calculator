import { describe, expect, it } from 'vitest'

import { getStaticImportSpecifiers } from './helpers/staticImports'

function importsFor(path) {
  return getStaticImportSpecifiers(new URL(`../${path}`, import.meta.url))
}

function importsModule(specifiers, moduleName) {
  return specifiers.some((specifier) =>
    new RegExp(`(?:^|/)${moduleName}(?:\\.[cm]?[jt]s)?$`).test(specifier),
  )
}

describe('calculation dependency graph', () => {
  it('keeps planning modules independent from calculation execution owners', () => {
    const executionOwners = [
      'ScoreCalculator',
      'DamageCalculator',
      'BacktrackCalculator',
      'DxCalculator',
      'RuntimeDamageRollCalculator',
      'DamageAggregationExecutor',
      'BacktrackDistributionGenerator',
      'BacktrackLivingdeadDistribution',
      'BacktrackPlanValidation',
    ]
    const planningModules = [
      'src/calculation/planning/ScoreRangePlanner.ts',
      'src/calculation/planning/DamageRangePlanner.ts',
      'src/calculation/planning/BacktrackRangePlanner.ts',
      'src/calculation/planning/ResourcePlan.ts',
      'src/calculation/planning/RangePolicy.ts',
      'src/calculation/planning/PlanningMath.ts',
    ]

    for (const path of planningModules) {
      const specifiers = importsFor(path)
      for (const owner of executionOwners) {
        expect(importsModule(specifiers, owner), `${path} -> ${owner}`).toBe(false)
      }
    }
  })

  it('keeps score and DX producers independent from the range planner facade', () => {
    for (const path of [
      'src/calculation/ScoreCalculator.ts',
      'src/calculation/DxCalculator.ts',
    ]) {
      expect(importsModule(importsFor(path), 'RangePlanner'), path).toBe(false)
    }
  })

  it('keeps damage aggregation metadata and execution dependencies one-way', () => {
    const metadataImports = importsFor(
      'src/calculation/DamageAggregationMetadata.ts',
    )
    expect(metadataImports).not.toContain('../core/probability/FFT')
    expect(importsModule(metadataImports, 'DamageAggregationExecutor')).toBe(false)

    const executorImports = importsFor(
      'src/calculation/DamageAggregationExecutor.ts',
    )
    expect(importsModule(executorImports, 'DamageAggregationPlanner')).toBe(false)
    expect(importsModule(executorImports, 'DamageAggregationInspection')).toBe(false)
  })

  it('keeps generic distribution results independent from damage-specific modules', () => {
    const distributionImports = importsFor(
      'src/calculation/DistributionResult.ts',
    )

    for (const moduleName of [
      'DamageCalculator',
      'DamageExpectationCertificate',
      'DamageStatistics',
      'DamageAggregation',
    ]) {
      expect(importsModule(distributionImports, moduleName), moduleName).toBe(false)
    }
  })

  it('keeps line-chart consumers behind the shared chart boundary', () => {
    const lineChartConsumers = [
      'src/features/check/ui/ScoreChart.vue',
      'src/features/attack/ui/ScoreChart.vue',
      'src/features/attack/ui/DamageChart.vue',
    ]
    const chartLibraries = [
      'chart.js',
      'vue-chartjs',
      'chartjs-plugin-annotation',
    ]

    for (const path of lineChartConsumers) {
      const specifiers = importsFor(path)
      expect(
        specifiers,
        `${path} should use the shared line-chart component`,
      ).toContain('@/shared/chart/ProbabilityLineChart.vue')

      for (const library of chartLibraries) {
        expect(specifiers, `${path} -> ${library}`).not.toContain(library)
      }
    }
  })
})
