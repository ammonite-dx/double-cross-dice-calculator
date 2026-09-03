import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const directory = new URL('../src/shared/validation/', import.meta.url)

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
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
      expect(contents).not.toMatch(/(?:application|components|views|router|plugins|layouts|presentation|features|calculation)\//)
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
  })
})
