import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const attackSource = readSource('../src/views/Attack.vue')
const attackTemplate = attackSource.slice(attackSource.indexOf('<template>'))
const inputFormSource = readSource('../src/components/Attack/InputForm.vue')
const comboFormSource = readSource('../src/components/Attack/ComboForm.vue')
const scoreChartSource = readSource('../src/components/Attack/ScoreChart.vue')
const damageChartSource = readSource('../src/components/Attack/DamageChart.vue')
const summaryTableSource = readSource('../src/components/Attack/SummaryTable.vue')
const damageFormSource = readSource('../src/components/Attack/DamageSettingForm.vue')

describe('Attack canonical integration contract', () => {
  it('connects the production view to one canonical lifecycle', () => {
    expect(attackSource).toMatch(/onMounted\s*\(/)
    expect(attackSource).toContain('createAttackCanonicalRunner')
    expect(attackSource).toContain('canonicalCalculationRunner.dispose()')
    expect(attackSource).toContain('canonicalCalculationRunner.run({')
    expect(attackSource).toContain('RangePlanNotice')
    expect(attackSource).not.toContain('canonicalOptIn')
    expect(attackSource).not.toContain('runInitialCalculation')
    expect(attackSource).not.toContain('calculateAttackCombo')
    expect(attackSource).not.toContain('calculateTotalDamage')
  })

  it('uses canonical presentation for every production output', () => {
    for (const output of [
      '<ScoreChartPanel',
      '<DamageChartPanel',
      '<SummaryPanel',
    ]) {
      expect(attackTemplate).toContain(output)
    }
    expect(attackTemplate).toContain(':presentation="canonicalDisplayPresentation"')
    expect(attackTemplate).toContain(':presentation="canonicalScoreDisplayPresentation"')
    expect(scoreChartSource).toContain('getCanonicalAttackScoreChartData')
    expect(damageChartSource).toContain('getCanonicalAttackDamageChartData')
    expect(summaryTableSource).toContain('getCanonicalScoreSummaryForCombo')
    for (const source of [scoreChartSource, damageChartSource, summaryTableSource]) {
      expect(source).not.toContain('canonicalOptIn')
    }
  })

  it('removes legacy calculation lanes and the temporary debug panel from input', () => {
    for (const source of [inputFormSource, comboFormSource, attackTemplate]) {
      expect(source).not.toContain('calculateAttackCombo')
      expect(source).not.toContain('calculateTotalDamage')
      expect(source).not.toContain('CanonicalAttackPanel')
      expect(source).not.toContain('canonicalOptIn')
    }
  })

  it('keeps the display range validation boundary at the existing 999 limit', () => {
    expect(damageFormSource).toContain("defineEmits(['validated'])")
    expect(damageFormSource).toContain('createAttackDisplayRequestSnapshot')
    expect(damageFormSource).toContain('ATTACK_DISPLAY_MODES.PMF')
    expect(damageFormSource).toContain('ATTACK_DISPLAY_MODES.UPPER_TAIL')
    expect(damageFormSource).toContain('max="999"')
    expect(damageFormSource).not.toMatch(/props\.displayRequest\.[\w]+\s*=/)
  })
})
