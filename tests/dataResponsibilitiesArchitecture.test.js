import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const thisTestPath = 'tests/dataResponsibilitiesArchitecture.test.js'
const repositoryRoot = fileURLToPath(root)
const eslint = new ESLint({ cwd: repositoryRoot })

function source(path) {
  return readFileSync(new URL(path, root), 'utf8')
}

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

async function lintText(filePath, text) {
  const [result] = await eslint.lintText(text, { filePath })
  return result
}

const probabilityDirectory = 'src/core/probability'
const themeDirectory = 'src/shared/theme'
const probabilityFiles = [
  `${probabilityDirectory}/Distribution.js`,
  `${probabilityDirectory}/FFT.js`,
]
const themeFiles = [`${themeDirectory}/ChartPalette.js`]
const referenceFiles = [
  'tooling/reference-data/PrecomputedDataSchema.js',
  'tooling/reference-data/ReferencePrecomputedDataRepository.js',
]
const retiredFiles = [
  'src/data/ColorSetter.js',
  'src/data/Distribution.js',
  'src/data/FFT.js',
  'src/data/PrecomputedDataSchema.js',
  'src/data/ReferencePrecomputedDataRepository.js',
]

const oldDataImportPattern = /(?:from\s+|import\s*\(\s*)['"][^'"]*\/data\/(?:Distribution|FFT|ColorSetter|ReferencePrecomputedDataRepository|PrecomputedDataSchema)(?:\.js)?['"]/
const referenceImportPattern = /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:tooling\/reference-data|ReferencePrecomputedDataRepository|PrecomputedDataSchema)/
const coreBoundaryPattern = /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:application|components|views|router|plugins|layouts|presentation|features|shared|tooling|node:|vue(?:-router)?|vuetify|chart\.js|vue-chartjs|chartjs-plugin-)/
const themeBoundaryPattern = /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:application|calculation|core|domain|features|presentation|tooling|node:|vue|vuetify|chart\.js|vue-chartjs|chartjs-plugin-)/
const themeSiblingBoundaryPattern = /(?:from\s+|import\s*\(\s*)['"](?:\.\.\/)+(?:validation|chart)(?:\/|['"])/

describe('data responsibility architecture', () => {
  it('keeps each responsibility at its current path and retires src/data', () => {
    for (const path of probabilityFiles.concat(themeFiles, referenceFiles)) {
      expect(existsSync(new URL(path, root)), path).toBe(true)
    }
    for (const path of retiredFiles) {
      expect(existsSync(new URL(path, root)), path).toBe(false)
    }
    expect(existsSync(new URL('src/data', root))).toBe(false)
  })

  it('does not retain old data imports in source or tests', () => {
    for (const path of sourceFilesRecursive('src').concat(sourceFilesRecursive('tests'))) {
      if (path === thisTestPath) {
        continue
      }
      expect(source(path), path).not.toMatch(oldDataImportPattern)
    }
  })

  it('keeps reference tooling outside the production source graph', () => {
    for (const path of sourceFilesRecursive('src')) {
      expect(source(path), path).not.toMatch(referenceImportPattern)
      expect(source(path), path).not.toContain('tooling/reference-data')
    }
  })

  it('keeps probability primitives independent of application and UI layers', () => {
    for (const path of probabilityFiles) {
      expect(source(path), path).not.toMatch(coreBoundaryPattern)
    }
  })

  it('keeps shared theme utilities as dependency-free leaves', () => {
    for (const path of themeFiles) {
      expect(source(path), path).not.toMatch(themeBoundaryPattern)
      expect(source(path), path).not.toMatch(themeSiblingBoundaryPattern)
    }
  })

  it('keeps the ESLint core and shared theme boundaries aligned with the source scan', async () => {
    const coreResult = await lintText(
      'src/core/probability/ArchitectureFixture.js',
      "import useCheck from '@/features/check/model/useCheck'",
    )
    expect(coreResult.errorCount).toBeGreaterThan(0)
    expect(coreResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const themeCalculationResult = await lintText(
      'src/shared/theme/ArchitectureFixture.js',
      "import score from '@/calculation/ScoreCalculator'",
    )
    expect(themeCalculationResult.errorCount).toBeGreaterThan(0)
    expect(themeCalculationResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const themeValidationResult = await lintText(
      'src/shared/theme/ArchitectureFixture.js',
      "import rules from '@/shared/validation/IntegerRules'",
    )
    expect(themeValidationResult.errorCount).toBeGreaterThan(0)
    expect(themeValidationResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const themeRelativeValidationResult = await lintText(
      'src/shared/theme/ArchitectureFixture.js',
      "import rules from '../validation/IntegerRules'",
    )
    expect(themeRelativeValidationResult.errorCount).toBeGreaterThan(0)
    expect(themeRelativeValidationResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const themeRelativeChartResult = await lintText(
      'src/shared/theme/ArchitectureFixture.js',
      "import config from '../chart/ProbabilityLineChartConfig'",
    )
    expect(themeRelativeChartResult.errorCount).toBeGreaterThan(0)
    expect(themeRelativeChartResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const themeMultiParentResult = await lintText(
      'src/shared/theme/tokens/ArchitectureFixture.js',
      "import rules from '../../validation/IntegerRules'",
    )
    expect(themeMultiParentResult.errorCount).toBeGreaterThan(0)
    expect(themeMultiParentResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const themeLocalResult = await lintText(
      'src/shared/theme/ArchitectureFixture.js',
      "import './Colors'",
    )
    expect(themeLocalResult.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    expect("import rules from '../validation/IntegerRules'").toMatch(themeSiblingBoundaryPattern)
    expect("import config from '../../chart/ProbabilityLineChartConfig'").toMatch(themeSiblingBoundaryPattern)
  })
})
