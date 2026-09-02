import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

function source(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

function sourceFiles(path) {
  const directory = new URL(path, root)
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${path}${entry.name}`)
}

describe('Check feature architecture', () => {
  it('keeps the route view as a thin feature adapter', () => {
    const view = source('src/views/Check.vue')

    expect(view).toContain("import CheckPage from '@/features/check/ui/CheckPage.vue'")
    expect(view).toMatch(/<CheckPage\s*\/>/)
    expect(view).not.toMatch(/\b(computed|inject|reactive|onMounted|onUnmounted)\b/)
    expect(view).not.toMatch(/CalculationClient|CalculationFeedback|DisplayRangePlanner/)
  })

  it('keeps controller ownership and narrow composition in CheckPage', () => {
    const page = source('src/features/check/ui/CheckPage.vue')

    expect(page).toContain("import { useCheck } from '../model/useCheck'")
    expect(page).toContain('await useCheck({ calculationClient })')
    expect(page).toContain('<InputPanel')
    expect(page).toContain('<ChartPanel')
    expect(page).toContain('<SummaryPanel')
    expect(page).not.toContain('calculateCheckCanonical')
    expect(page).not.toContain('checkData')
  })

  it('retires the old Check model and component paths', () => {
    const oldPaths = [
      'src/application/CheckInputSnapshot.ts',
      'src/application/CheckDisplayRequestSnapshot.js',
      'src/application/CheckCanonicalPresentation.js',
      'src/components/Check',
    ]

    for (const path of oldPaths) {
      expect(existsSync(new URL(path, root))).toBe(false)
    }
  })

  it('does not expose a broad checkData prop in feature UI', () => {
    for (const path of sourceFiles('src/features/check/ui/')) {
      expect(source(path)).not.toContain('checkData')
    }
  })

  it('preserves the /check router entry through the route view', () => {
    const router = source('src/router/index.js')

    expect(router).toContain("{path: '/check', component: () => import('@/views/Check.vue')}")
  })

  it('keeps feature models independent of UI modules and escape hatches', () => {
    for (const path of sourceFiles('src/features/check/model/')) {
      const model = source(path)
      expect(model).not.toMatch(/(?:views|components|router|plugins|layouts|\/ui\/)/)
      expect(model).not.toMatch(/\bas any\b|@ts-ignore|@ts-nocheck/)
    }
  })

  it('does not retain old Check import paths in production or tests', () => {
    const directories = ['src', 'tests']
    const forbidden = /(?:application\/(?:CheckInputSnapshot|CheckDisplayRequestSnapshot|CheckCanonicalPresentation)|components\/Check)/

    for (const directory of directories) {
      const files = sourceFilesRecursive(directory)
      for (const path of files) {
        if (path.endsWith('/checkFeatureArchitecture.test.js')) {
          continue
        }
        expect(source(path)).not.toMatch(forbidden)
      }
    }
  })
})

function sourceFilesRecursive(path) {
  const directory = new URL(`${path}/`, root)
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory()) {
      return sourceFilesRecursive(child)
    }
    return /\.(?:js|ts|vue)$/.test(entry.name) ? [child] : []
  })
}
