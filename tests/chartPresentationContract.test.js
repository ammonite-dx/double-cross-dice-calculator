import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

describe('chart presentation contract', () => {
  it('keeps Chart.js runtime ownership in the shared line component', () => {
    const sharedRuntime = source('src/shared/chart/ProbabilityLineChart.vue')

    expect(sharedRuntime).toContain('Chart.register')
    expect(sharedRuntime).toContain('useDisplay')
    expect(sharedRuntime).toContain("from 'vue-chartjs'")
    expect(sharedRuntime).toContain('accessibleName')
    expect(sharedRuntime).toContain(':aria-label="props.accessibleName"')
    expect(sharedRuntime).not.toContain('role="img"')

    for (const path of [
      'src/features/check/ui/ScoreChart.vue',
      'src/features/attack/ui/ScoreChart.vue',
      'src/features/attack/ui/DamageChart.vue',
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

  it('keeps feature chart labels and line presentation stable', () => {
    expect(source('src/features/check/ui/ScoreChart.vue'))
      .toContain('一般判定 達成値確率分布')
    expect(source('src/features/attack/ui/ScoreChart.vue'))
      .toContain('攻撃判定 達成値確率分布')
    expect(source('src/features/attack/ui/DamageChart.vue'))
      .toContain('攻撃判定 ダメージ確率分布')
  })

  it('keeps the Backtrack Doughnut chart outside the shared line runtime', () => {
    const backtrackChart = source(
      'src/features/backtrack/ui/FinalEncroachmentChart.vue',
    )
    expect(backtrackChart).toContain('Doughnut')
    expect(backtrackChart).toContain('Chart.register')
    expect(backtrackChart).toContain('aria-label')
    expect(backtrackChart).not.toContain('role="img"')
    expect(backtrackChart).not.toContain('ProbabilityLineChart')
  })
})
