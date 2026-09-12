import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function countOccurrences(source, pattern) {
  return source.match(pattern)?.length ?? 0
}

const attackSource = readSource('../src/features/attack/ui/AttackForm.vue')
const defenceSource = readSource('../src/features/attack/ui/DefenceForm.vue')

describe('production compound D10 inputs', () => {
  it('keeps Attack power grouped while exposing two distinct input names', () => {
    expect(attackSource).toContain('useId')
    expect(attackSource).toContain('const attackPowerGroupId = useId();')
    expect(countOccurrences(attackSource, /role="group"/g)).toBe(1)
    expect(attackSource).toContain('class="compound-d10-group"')
    expect(attackSource).toContain(
      'class="compound-d10-group__label text-caption text-medium-emphasis"',
    )
    expect(attackSource).toContain('>攻撃力</span>')
    expect(attackSource).toContain('label="攻撃力（ダイス）"')
    expect(attackSource).toContain('label="攻撃力（固定値）"')
    expect(attackSource).toContain('攻撃力（ダイス）</span>')
    expect(attackSource).toContain('攻撃力（固定値）</span>')
    expect(attackSource).toContain('v-model.number="currentParams.damage.dice"')
    expect(attackSource).toContain('v-model.number="currentParams.damage.value"')
    expect(attackSource).toContain(':rules="attackDiceRule"')
    expect(attackSource).toContain(':rules="attackValueRule"')
    expect(attackSource).toContain('suffix="D10+"')
    expect(attackSource).toContain('md="3" cols="12"')
    expect(countOccurrences(attackSource, /<v-col cols="6" class="(?:pr|pl)-0">/g)).toBe(2)
    expect(attackSource).toContain('inset-block-start: -4px;')
    expect(attackSource).toContain('inset-inline-start: 0;')
    expect(attackSource).not.toContain('label="攻撃力" suffix="D10+"')
  })

  it('keeps Dodge, Evasion, and Guard groups distinct and accessible', () => {
    expect(defenceSource).toContain('useId')
    expect(defenceSource).toContain('const defenceReductionGroupId = useId();')
    expect(countOccurrences(defenceSource, /role="group"/g)).toBe(3)
    expect(countOccurrences(
      defenceSource,
      /class="compound-d10-group__label text-caption text-medium-emphasis"/g,
    )).toBe(3)
    expect(defenceSource).toContain('label="装甲・軽減値（ダイス）"')
    expect(defenceSource).toContain('label="装甲・軽減値（固定値）"')
    expect(defenceSource).toContain('label="ガード・装甲・軽減値（ダイス）"')
    expect(defenceSource).toContain('label="ガード・装甲・軽減値（固定値）"')
    expect(countOccurrences(defenceSource, /v-model\.number="currentParams\.damage\.dice"/g)).toBe(3)
    expect(countOccurrences(defenceSource, /v-model\.number="currentParams\.damage\.value"/g)).toBe(3)
    expect(countOccurrences(defenceSource, /:rules="defenceDiceRule"/g)).toBe(3)
    expect(countOccurrences(defenceSource, /:rules="defenceValueRule"/g)).toBe(3)
    expect(countOccurrences(defenceSource, /suffix="D10\+"/g)).toBe(3)
    expect(defenceSource).toContain('md="3" cols="12"')
    expect(defenceSource).toContain('md="4" cols="12"')
    expect(defenceSource).toContain(
      'class="compound-d10-group compound-d10-group--direct-row pt-2 ma-0"',
    )
    expect(defenceSource).toContain('>装甲・軽減値</span>')
    expect(defenceSource).toContain('>ガード・装甲・軽減値</span>')
    expect(defenceSource).toContain('inset-block-start: -4px;')
    expect(defenceSource).toContain('inset-inline-start: 0;')
    expect(defenceSource).toContain(
      '.compound-d10-group--direct-row > .compound-d10-group__label',
    )
    expect(defenceSource).toContain('inset-block-start: 4px;')
    expect(defenceSource).toContain('inset-inline-start: 4px;')
    expect(countOccurrences(defenceSource, /<template #label>/g)).toBe(6)
  })
})
