import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const attackSource = readFileSync(
  new URL('../src/views/Attack.vue', import.meta.url),
  'utf8'
)
const attackTemplate = attackSource.slice(attackSource.indexOf('<template>'))
const canonicalPanelSource = readFileSync(
  new URL('../src/components/Attack/CanonicalAttackPanel.vue', import.meta.url),
  'utf8'
)

describe('Attack canonical integration contract', () => {
  it('connects the independent canonical panel without replacing legacy output', () => {
    expect(attackSource).toContain(
      "import CanonicalAttackPanel from '@/components/Attack/CanonicalAttackPanel.vue'"
    )
    expect(attackTemplate).toContain(
      '<CanonicalAttackPanel :attackData="attackData" />'
    )
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

  it('keeps score on legacy data and gates damage/summary through the display adapter', () => {
    expect(attackSource).toContain(
      "import {\n        createCanonicalLegacyAttackDisplay,\n    } from '@/application/CanonicalLegacyAttackDisplay'"
    )
    expect(attackSource).toContain(
      'createCanonicalLegacyAttackDisplay(attackData)'
    )
    expect(attackTemplate).toContain(
      '<ScoreChartPanel :attackData="attackData"/>'
    )
    expect(attackTemplate).toContain(
      '<DamageChartPanel :attackData="displayAttackData"/>'
    )
    expect(attackTemplate).toContain(
      '<SummaryPanel :attackData="displayAttackData"/>'
    )
    expect(attackSource).toContain(
      'canonicalLegacyDisplay.value.kind === \'projected\''
    )
    expect(attackSource).toContain(': attackData')
  })

  it('keeps the canonical panel isolated from legacy result fields', () => {
    expect(canonicalPanelSource).toContain('canonicalTotalDamageReady')
    expect(canonicalPanelSource).toContain('canonicalTotalDamagePresentation')
    expect(canonicalPanelSource).toContain('canonicalDamagePresentation')
    for (const legacyField of ['score', 'damage', 'resultReady']) {
      expect(canonicalPanelSource).not.toMatch(new RegExp(`\\b${legacyField}\\b`))
    }
  })
})
