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
  ])('exposes a semantic and accessible control for the %s checkbox', (_name, path) => {
    const source = readSource(path)

    expect(source).toContain('advancedSettingsEnabled')
    expect(source).toContain('advanced-settings-changed')
    expect(source).toContain('label="高度な設定"')
    expect(source).not.toContain('showDetails')
    expect(source).not.toContain('show-details')
  })
})
