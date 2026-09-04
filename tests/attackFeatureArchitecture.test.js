import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const modelSource = source('src/features/attack/model/useAttack.ts')
const comboStateSource = source('src/features/attack/model/AttackComboState.ts')
const pageSource = source('src/features/attack/ui/AttackPage.vue')
const routeSource = source('src/views/Attack.vue')
const inputFiles = [
  'src/features/attack/ui/InputForm.vue',
  'src/features/attack/ui/InputPanel.vue',
  'src/features/attack/ui/ComboForm.vue',
  'src/features/attack/ui/AttackForm.vue',
  'src/features/attack/ui/DefenceForm.vue',
]

describe('Attack feature architecture', () => {
  it('has a feature model, page, and public page-only entry point', () => {
    for (const path of [
      'src/features/attack/model/useAttack.ts',
      'src/features/attack/model/AttackComboState.ts',
      'src/features/attack/ui/AttackPage.vue',
      'src/features/attack/index.ts',
    ]) {
      expect(existsSync(new URL(`../${path}`, import.meta.url))).toBe(true)
    }
    expect(source('src/features/attack/index.ts')).toContain(
      "export { default as AttackPage } from './ui/AttackPage.vue'",
    )
    expect(source('src/features/attack/index.ts')).not.toContain('useAttack')
    expect(source('src/features/attack/index.ts')).not.toContain('AttackComboState')
  })

  it('removes the old Attack component path and keeps the route thin', () => {
    expect(existsSync(new URL('../src/components/Attack/', import.meta.url))).toBe(false)
    expect(routeSource).toContain("from '@/features/attack'")
    for (const pattern of [
      'reactive(',
      'computed(',
      'watch(',
      'onMounted(',
      'onUnmounted(',
      'createAttackCanonicalRunner',
      'createCanonicalAttackState',
      'calculateAttackCanonicalBatch',
    ]) {
      expect(routeSource).not.toContain(pattern)
    }
  })

  it('co-locates Attack canonical modules in the feature model and injects the client at Page', () => {
    for (const path of [
      'src/features/attack/model/AttackCanonicalDisplayFeedback.js',
      'src/features/attack/model/AttackCanonicalPresentation.js',
      'src/features/attack/model/AttackCanonicalRunner.js',
      'src/features/attack/model/AttackCanonicalState.js',
      'src/features/attack/model/AttackDisplayRequestSnapshot.js',
      'src/features/attack/model/AttackInputSnapshot.js',
    ]) {
      expect(existsSync(new URL(`../${path}`, import.meta.url))).toBe(true)
    }
    for (const path of [
      'src/application/AttackCanonicalDisplayFeedback.js',
      'src/application/AttackCanonicalPresentation.js',
      'src/application/AttackCanonicalRunner.js',
      'src/application/AttackCanonicalState.js',
      'src/application/AttackDisplayRequestSnapshot.js',
      'src/application/AttackInputSnapshot.js',
    ]) {
      expect(existsSync(new URL(`../${path}`, import.meta.url))).toBe(false)
    }
    expect(pageSource).toContain('CALCULATION_CLIENT_KEY')
    expect(pageSource).toContain('useAttack({ calculationClient })')
    expect(modelSource).not.toContain('defaultCalculationClient')
    expect(modelSource).not.toContain('inject(')
  })

  it('uses a single controller-owned monotonic id and fresh canonical state', () => {
    expect(modelSource).toContain('let nextComboId')
    expect(modelSource).toContain('allocateComboId')
    expect(modelSource).toContain('cloneAttackCombo')
    expect(comboStateSource).toContain('createCanonicalComboDataState')
    expect(comboStateSource).toContain('snapshotCanonicalAttackParams')
  })

  it('uses one-way events and does not mutate UI props', () => {
    const forbidden = [
      /props\.[\w.]+\s*=/,
      /props\.[\w.]+\.push\(/,
      /props\.[\w.]+\.splice\(/,
      /v-model="combo\.name"/,
      /replaceAttackSideSnapshot\(/,
      /attackData/,
      /comboData/,
    ]
    for (const path of inputFiles) {
      const contents = source(path)
      for (const pattern of forbidden) {
        expect(contents, path).not.toMatch(pattern)
      }
    }

    const inputForm = source('src/features/attack/ui/InputForm.vue')
    for (const event of [
      'combo-add',
      'combo-duplicate',
      'combo-remove',
      'combo-name-changed',
      'combo-visibility-changed',
      'combo-details-changed',
      'combo-side-validated',
    ]) {
      expect(inputForm).toContain(`'${event}'`)
    }
    const comboForm = source('src/features/attack/ui/ComboForm.vue')
    expect(comboForm).toContain("defineEmits(['side-validated', 'show-details'])")
    expect(comboForm).not.toContain('replaceAttackSideSnapshot')
    expect(pageSource).toContain('@combo-side-validated="onComboSideValidated"')
  })

  it('keeps calculation boundaries out of child UI', () => {
    for (const path of inputFiles.concat([
      'src/features/attack/ui/ScoreChart.vue',
      'src/features/attack/ui/DamageChart.vue',
      'src/features/attack/ui/SummaryPanel.vue',
    ])) {
      const contents = source(path)
      expect(contents, path).not.toMatch(/from ['"].*calculation/)
      expect(contents, path).not.toContain('CalculationClient')
    }
    expect(modelSource).not.toMatch(/\bany\b|@ts-ignore|@ts-nocheck/)
  })
})
