import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const attackSource = readFileSync(
  new URL('../src/views/Attack.vue', import.meta.url),
  'utf8'
)
const attackTemplate = attackSource.slice(attackSource.indexOf('<template>'))

describe('Attack canonical integration contract', () => {
  it('does not connect canonical state to the existing template', () => {
    expect(attackTemplate).not.toContain('canonical')
  })

  it('keeps legacy resultsReady derived from legacy fields', () => {
    expect(attackSource).toContain('areAllComboResultsReady(attackData.combos)')
    expect(attackSource).toContain('&& attackData.totalDamageReady')
  })

  it('keeps the opt-in watch lifecycle explicit', () => {
    expect(attackSource).toContain('canonicalOptIn: false')
    expect(attackSource).toContain('{ deep: true, immediate: true }')
    expect(attackSource).toContain('canonicalCalculationRunner.invalidate()')
  })
})
