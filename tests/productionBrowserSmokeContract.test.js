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
})
