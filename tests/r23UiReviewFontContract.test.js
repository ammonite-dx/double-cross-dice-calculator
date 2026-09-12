import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const runnerSource = readFileSync(
  new URL('../experiments/r23-ui-review/playwright-runner.mjs', import.meta.url),
  'utf8',
)

describe('R23 production font capture contract', () => {
  it('does not stub Google Fonts in the visual runner', () => {
    expect(runnerSource).not.toContain('stubExternalFonts')
    expect(runnerSource).not.toContain('fonts.googleapis.com')
    expect(runnerSource).not.toContain('fonts.gstatic.com')
  })

  it('requires and records production Roboto readiness', () => {
    expect(runnerSource).toContain('waitForProductionFonts')
    expect(runnerSource).toContain('wf-active')
    expect(runnerSource).toContain('wf-inactive')
    expect(runnerSource).toContain('document.fonts')
    expect(runnerSource).toContain("document.fonts.check('400 16px Roboto')")
    expect(runnerSource).toContain('fontEvidence')
    expect(runnerSource).toContain('applicationFontFamily')
  })
})
