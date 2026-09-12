import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../src/layouts/MainArea.vue', import.meta.url),
  'utf8',
)

describe('MainArea layout contract', () => {
  it('keeps content and footer in a normal-flow flex shell', () => {
    expect(source).toContain('<v-main class="main-area">')
    expect(source).toContain('<div class="main-area__content">')
    expect(source).toContain('<v-footer class="main-area__footer" color="secondary">')
    expect(source).toContain('display: flex;')
    expect(source).toContain('flex-direction: column;')
    expect(source).toContain('min-height: 100vh;')
    expect(source).toContain('.main-area__content {')
    expect(source).toContain('flex: 1 0 auto;')
    expect(source).toContain('.main-area__footer {')
    expect(source).toContain('flex: 0 0 auto;')
    expect(source).not.toMatch(/position:\s*(?:fixed|absolute)/)
    expect(source).not.toMatch(/bottom:\s*0/)
  })
})
