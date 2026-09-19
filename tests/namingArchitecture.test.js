import { readdirSync, readFileSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const sourceRoot = resolve(repositoryRoot, 'src')
const testsRoot = resolve(repositoryRoot, 'tests')

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(filePath)
    }
    return /\.(?:js|ts|vue)$/.test(entry.name) ? [filePath] : []
  })
}

const files = sourceFiles(sourceRoot)
const sourceText = files.map((filePath) => ({
  path: relative(repositoryRoot, filePath),
  contents: readFileSync(filePath, 'utf8'),
}))

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return testFiles(filePath)
    }
    return /\.test\.(?:js|ts|vue)$/.test(entry.name) ? [filePath] : []
  })
}

const coreTestText = testFiles(testsRoot)
  .filter((filePath) => !filePath.includes(`${resolve(testsRoot, 'reference')}`))
  .map((filePath) => ({
    path: relative(repositoryRoot, filePath),
    contents: readFileSync(filePath, 'utf8'),
  }))
const referenceCompatibilitySource = readFileSync(
  resolve(
    repositoryRoot,
    'tooling/reference-data/PublishedBucketCompatibility.js'
  ),
  'utf8'
)

const retiredIdentifiers = [
  'calculateCheckCanonical',
  'calculateAttackCanonical',
  'calculateAttackCanonicalBatch',
  'calculateCanonicalTotalDamage',
  'calculateBacktrackCanonical',
  'calculateScoreCanonical',
  'calculateCanonicalDamageOnDemand',
  'calculateFinalEncroachmentCanonical',
  'canonicalScore',
  'canonicalDamage',
  'canonicalTotalDamage',
  'AttackCanonical',
  'CheckCanonical',
  'BacktrackCanonical',
  'CanonicalDamageAggregation',
  'CanonicalChartSeriesAdapter',
  'CanonicalSummaryFormatter',
]

describe('production naming boundaries', () => {
  it('keeps migration-only prefixes out of source filenames', () => {
    expect(
      files
        .map((filePath) => basename(filePath))
        .filter((fileName) => fileName.includes('Canonical'))
    ).toEqual([])
  })

  it('keeps retired production identifiers out of source text', () => {
    for (const { path, contents } of sourceText) {
      for (const identifier of retiredIdentifiers) {
        expect(contents, `${path}: ${identifier}`).not.toContain(identifier)
      }
    }
  })

  it('keeps published compatibility adapters outside production source', () => {
    const combined = sourceText.map(({ contents }) => contents).join('\n')
    expect(combined).not.toContain('fromPublishedBucketDistribution')
    expect(combined).not.toContain('toPublishedBucketDistribution')
    expect(referenceCompatibilitySource)
      .toContain('fromPublishedBucketDistribution')
    expect(referenceCompatibilitySource)
      .toContain('toPublishedBucketDistribution')
  })

  it('keeps reference tooling imports out of core tests', () => {
    for (const { path, contents } of coreTestText) {
      expect(contents, `${path}: reference tooling import`).not.toMatch(
        /(?:from|import)\s+['"][^'"]*tooling\/reference-data\//
      )
    }
  })
})
