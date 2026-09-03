import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const thisTestPath = 'tests/dataResponsibilitiesArchitecture.test.js'

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
    }
  })
})
