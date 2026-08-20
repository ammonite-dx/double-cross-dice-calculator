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
const damageFormSource = readFileSync(
  new URL('../src/components/Attack/DamageSettingForm.vue', import.meta.url),
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
    expect(attackSource).toContain('canonicalCalculationRunner.dispose()')
  })

  it('keeps score on legacy data and supplies canonical damage presentation directly', () => {
    expect(attackSource).toContain(
      'createAttackCanonicalDisplayPresentation(batchResult'
    )
    expect(attackSource).toContain(
      'canonicalCalculationRunner.refreshPresentation()'
    )
    expect(attackTemplate).toContain(
      '<ScoreChartPanel :attackData="attackData"/>'
    )
    expect(attackTemplate).toContain(
      ':displayRequest="displayRequest"'
    )
    expect(attackTemplate).toContain(
      ':presentation="canonicalDisplayPresentation"'
    )
    expect(attackSource).not.toContain('displayAttackData')
    expect(attackSource).not.toContain('createCanonicalLegacyAttackDisplay')
  })

  it('keeps the canonical panel isolated from legacy result fields', () => {
    expect(canonicalPanelSource).toContain('canonicalTotalDamageReady')
    expect(canonicalPanelSource).toContain('canonicalTotalDamagePresentation')
    expect(canonicalPanelSource).toContain('canonicalDamagePresentation')
    for (const legacyField of ['score', 'damage', 'resultReady']) {
      expect(canonicalPanelSource).not.toMatch(new RegExp(`\\b${legacyField}\\b`))
    }
  })

  it('keeps the damage display form controlled and canonical at its boundary', () => {
    expect(damageFormSource).toContain("defineEmits(['validated'])")
    expect(damageFormSource).toContain('createAttackDisplayRequestSnapshot')
    expect(damageFormSource).toContain('ATTACK_DISPLAY_MODES.PMF')
    expect(damageFormSource).toContain('ATTACK_DISPLAY_MODES.UPPER_TAIL')
    expect(damageFormSource).not.toMatch(/props\.displayRequest\.[\w]+\s*=/)
  })
})
