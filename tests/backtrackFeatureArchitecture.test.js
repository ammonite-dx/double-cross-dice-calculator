import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

function source(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

describe('Backtrack feature architecture', () => {
  it('keeps the route view as a thin feature entry point', () => {
    const view = source('src/views/Backtrack.vue')

    expect(view).toContain("@/features/backtrack/ui/BacktrackPage.vue")
    expect(view).not.toContain('CalculationClient')
    expect(view).not.toContain('BacktrackCalculationRunner')
    expect(view).not.toContain('reactive(')
    expect(view).not.toContain('onMounted(')
    expect(view).not.toContain('onUnmounted(')
  })

  it('connects the feature page to its route-scoped composable', () => {
    const page = source('src/features/backtrack/ui/BacktrackPage.vue')
    const composable = source('src/features/backtrack/model/useBacktrack.ts')

    expect(page).toContain("import { useBacktrack } from '../model/useBacktrack'")
    expect(page).toContain('useBacktrack({ calculationClient })')
    expect(composable).toContain('createBacktrackRunner')
    expect(composable).toContain('onMounted(')
    expect(composable).toContain('onUnmounted(')
  })

  it('removes the former application, presentation, and component paths', () => {
    const removedPaths = [
      'src/application/BacktrackCalculationRunner.js',
      'src/application/BacktrackInputSnapshot.ts',
      'src/presentation/BacktrackPresentation.js',
      'src/components/Backtrack/BacktrackForm.vue',
      'src/components/Backtrack/InputForm.vue',
      'src/components/Backtrack/InputPanel.vue',
      'src/components/Backtrack/FinalEncroachmentChart.vue',
      'src/components/Backtrack/FinalEncroachmentChartPanel.vue',
      'src/components/Backtrack/ChartSetter.js',
    ]

    for (const relativePath of removedPaths) {
      expect(existsSync(resolve(repositoryRoot, relativePath))).toBe(false)
    }
  })

  it('keeps feature UI props narrow instead of passing backtrackData', () => {
    const uiFiles = [
      'BacktrackPage.vue',
      'BacktrackForm.vue',
      'InputForm.vue',
      'InputPanel.vue',
      'FinalEncroachmentChart.vue',
      'FinalEncroachmentChartPanel.vue',
      'ChartSetter.js',
    ]

    for (const fileName of uiFiles) {
      expect(source(`src/features/backtrack/ui/${fileName}`))
        .not.toContain('backtrackData')
    }
  })

  it('preserves the /backtrack router entry point', () => {
    const router = source('src/router/index.js')

    expect(router).toMatch(/path:\s*['"]\/backtrack['"]/) 
    expect(router).toContain("@/views/Backtrack.vue")
  })
})
