import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('advanced-setting controls', () => {
  it.each([
    ['check', '../src/features/check/ui/ScoreForm.vue'],
    ['attack', '../src/features/attack/ui/AttackForm.vue'],
    ['defence', '../src/features/attack/ui/DefenceForm.vue'],
  ])('declares the public inline prop for the %s checkbox', (_name, path) => {
    const source = readSource(path)

    expect(source).toMatch(
      /<v-checkbox-btn v-model="showDetails" density="compact" inline class="h-50" \/>/,
    )
  })
})
