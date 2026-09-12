import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('display-setting field density', () => {
  it.each([
    ['check', '../src/features/check/ui/SettingForm.vue'],
    ['attack score', '../src/features/attack/ui/ScoreSettingForm.vue'],
    ['attack damage', '../src/features/attack/ui/DamageSettingForm.vue'],
  ])('uses comfortable density for the three %s controls', (_name, path) => {
    const source = readSource(path)

    for (const label of ['最小値', '最大値', '表示モード']) {
      expect(source).toMatch(
        new RegExp(`<(?:v-text-field|v-select) label="${label}"[^>]*density="comfortable"`),
      )
    }
    expect(source.match(/density="comfortable"/g)).toHaveLength(3)
  })
})
