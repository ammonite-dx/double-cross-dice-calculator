import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const chartDirectory = new URL('../src/shared/chart/', import.meta.url)

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

describe('shared probability chart architecture', () => {
  it('contains direct-import chart modules without a barrel', () => {
    expect(existsSync(chartDirectory)).toBe(true)
    expect(readdirSync(chartDirectory).sort()).toEqual([
      'ProbabilityLineChart.vue',
      'ProbabilityLineChartConfig.js',
    ])
    expect(readdirSync(chartDirectory)).not.toContain('index.js')
  })

  it('keeps shared chart modules independent of application layers', () => {
    for (const file of readdirSync(chartDirectory)) {
      const contents = source(`src/shared/chart/${file}`)
      expect(contents).not.toMatch(
        /(?:application|calculation|data|domain|features|components|views|presentation|router|plugins|layouts)\//,
      )
      expect(contents).not.toMatch(/from ['"]node:/)
      expect(contents).not.toMatch(
        /\b(?:attackData|combo|difficulty|dfclty|opposed|canonical|CalculationClient)\b/i,
      )
    }
  })

  it('keeps Chart.js runtime ownership in the shared line component', () => {
    const sharedRuntime = source('src/shared/chart/ProbabilityLineChart.vue')
    expect(sharedRuntime).toContain('Chart.register')
    expect(sharedRuntime).toContain('useDisplay')
    expect(sharedRuntime).toContain("from 'vue-chartjs'")

    for (const path of [
      'src/features/check/ui/ScoreChart.vue',
      'src/components/Attack/ScoreChart.vue',
      'src/components/Attack/DamageChart.vue',
    ]) {
      const contents = source(path)
      expect(contents).toContain('@/shared/chart/ProbabilityLineChart.vue')
      expect(contents).not.toContain('Chart.register')
      expect(contents).not.toContain("from 'chart.js'")
      expect(contents).not.toContain("from 'vue-chartjs'")
      expect(contents).not.toContain('chartjs-plugin-annotation')
      expect(contents).not.toContain('useDisplay')
    }
  })

  it('keeps the Backtrack Doughnut chart outside the shared line runtime', () => {
    const backtrackChart = source(
      'src/features/backtrack/ui/FinalEncroachmentChart.vue',
    )
    expect(backtrackChart).toContain('Doughnut')
    expect(backtrackChart).toContain('Chart.register')
    expect(backtrackChart).not.toContain('ProbabilityLineChart')
  })
})
