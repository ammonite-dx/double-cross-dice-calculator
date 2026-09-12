import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const smokeSource = readFileSync(
  new URL('../scripts/production-browser-smoke.mjs', import.meta.url),
  'utf8',
)

describe('production browser smoke regression coverage', () => {
  it('covers stale-result invalidation after a rejected Check display request', () => {
    expect(smokeSource).toContain('check stale result invalidation')
    expect(smokeSource).toContain('stale score summary remained')
  })

  it('covers fixed-difficulty Check summary output', () => {
    expect(smokeSource).toContain('check fixed difficulty summary')
    expect(smokeSource).toContain("/99\\.\\d%/")
  })

  it('covers production compound D10 groups and their accessible names', () => {
    expect(smokeSource).toContain('assertCompoundD10Groups')
    expect(smokeSource).toContain('attack default dodge compound inputs')
    expect(smokeSource).toContain('attack evasion compound inputs')
    expect(smokeSource).toContain('attack guard compound inputs')
    expect(smokeSource).toContain('attack multi-combo compound inputs')
    for (const name of [
      '攻撃力（ダイス）',
      '攻撃力（固定値）',
      '装甲・軽減値（ダイス）',
      '装甲・軽減値（固定値）',
      'ガード・装甲・軽減値（ダイス）',
      'ガード・装甲・軽減値（固定値）',
    ]) {
      expect(smokeSource).toContain(name)
    }
  })
})
