import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const directory = new URL('../src/shared/validation/', import.meta.url)

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function sourceFilesRecursive(path) {
  const directory = new URL(`../${path}/`, import.meta.url)
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory()) {
      return sourceFilesRecursive(child)
    }
    return /\.(?:js|ts|vue)$/.test(entry.name) ? [child] : []
  })
}

describe('shared validation architecture', () => {
  it('contains the intended direct-import modules without a barrel', () => {
    expect(existsSync(directory)).toBe(true)
    const files = readdirSync(directory).sort()
    expect(files).toEqual([
      'DisplayRangeRules.ts',
      'IntegerRules.ts',
      'LatestValidationGate.ts',
      'ScoreInputRules.ts',
    ])
    expect(files).not.toContain('index.ts')
  })

  it('keeps validation modules independent of UI and calculation layers', () => {
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.ts')) {
        continue
      }
      const contents = source(`src/shared/validation/${file}`)
      expect(contents).not.toMatch(/from ['"](?:vue|vuetify|vue-router|chart\.js)/)
      expect(contents).not.toMatch(/(?:application|components|views|router|plugins|layouts|presentation|features|calculation|data)\//)
      expect(contents).not.toMatch(/from ['"]node:/)
      expect(contents).not.toMatch(/\b(?:window|document|fetch)\b/)
      expect(contents).not.toMatch(/\bany\b|@ts-ignore|@ts-nocheck/)
    }
  })

  it('allows the shared rules to consume the canonical domain predicates', () => {
    expect(source('src/shared/validation/ScoreInputRules.ts')).toContain(
      "@/domain/InputDomain",
    )
    expect(source('src/shared/validation/DisplayRangeRules.ts')).toContain(
      "@/domain/InputDomain",
    )
    expect(source('src/shared/validation/IntegerRules.ts')).toContain(
      "@/domain/InputDomain",
    )
    expect(source('src/shared/validation/IntegerRules.ts')).not.toContain(
      'Number.isSafeInteger',
    )
  })

  it('keeps shared validation as the only owner of duplicated rule definitions', () => {
    const scoreConsumers = [
      'src/features/check/ui/ScoreForm.vue',
      'src/features/attack/ui/AttackForm.vue',
      'src/features/attack/ui/DefenceForm.vue',
    ]
    for (const path of scoreConsumers) {
      const contents = source(path)
      expect(contents).toContain('createScoreFieldRules')
      expect(contents).not.toMatch(
        /const (diceRule|criticalRule|skillRule|youseiRule|shihaiRule) = \[\s*value =>/,
      )
    }

    const displayConsumers = [
      'src/features/check/ui/SettingForm.vue',
      'src/features/attack/ui/ScoreSettingForm.vue',
      'src/features/attack/ui/DamageSettingForm.vue',
    ]
    for (const path of displayConsumers) {
      const contents = source(path)
      expect(contents).toContain('createDisplayRangeRules')
      expect(contents).not.toContain('isSafeCoordinate')
      expect(contents).not.toContain('const minRule = [')
      expect(contents).not.toContain('const maxRule = [')
      expect(contents).not.toContain('validationGeneration')
    }
  })

  it('keeps the generic gate out of AttackInputSnapshot and the core', () => {
    expect(source('src/application/AttackInputSnapshot.js')).not.toContain(
      'createLatestValidationGate',
    )

    for (const path of [
      ...sourceFilesRecursive('src/calculation'),
      ...sourceFilesRecursive('src/domain'),
    ]) {
      expect(source(path)).not.toMatch(
        /(?:@\/|\.\.?\/)+shared(?:\/|['"])/,
      )
    }
  })
})
