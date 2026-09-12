import {
  SCENARIOS,
  VIEWPORTS,
  validateScenarioDefinitions,
} from './scenarios.js'

const replacement = (from, to, expectedCount = 1) => Object.freeze({
  from,
  to,
  expectedCount,
})

const target = (file, replacements) => Object.freeze({
  file,
  replacements: Object.freeze(replacements),
})

const sourcePrototype = (id, description, targets, scenarios, checks) => Object.freeze({
  id,
  description,
  targets: Object.freeze(targets),
  scenarios: Object.freeze(scenarios),
  checks: Object.freeze(checks),
})

const CHECK_SCENARIOS = Object.freeze([
  'check-desktop-ordinary',
  'check-mobile-ordinary',
])

const ATTACK_SCENARIOS = Object.freeze([
  'attack-desktop-single',
  'attack-mobile-single',
])

const SETTING_SCENARIOS = Object.freeze([
  ...CHECK_SCENARIOS,
  ...ATTACK_SCENARIOS,
])

const BACKTRACK_SCENARIOS = Object.freeze([
  'backtrack-mobile',
  'backtrack-mobile-livingdead',
  'backtrack-desktop',
])

const sourceScenario = (id, viewport, screenshot, option) => Object.freeze({
  id,
  route: '/attack',
  viewport,
  screenshot,
  initialCanvases: 2,
  expectedCanvases: 2,
  steps: Object.freeze([
    Object.freeze({
      type: 'select',
      label: '種別',
      option,
    }),
  ]),
})

const ATTACK_COMPOUND_SCENARIOS = Object.freeze([
  ...ATTACK_SCENARIOS,
  'attack-desktop-multi-combo',
  'attack-mobile-multi-combo',
  sourceScenario(
    'attack-desktop-evasion-compound',
    'desktop',
    '12-attack-desktop-evasion-compound.png',
    '《イベイジョン》',
  ),
  sourceScenario(
    'attack-mobile-evasion-compound',
    'mobile',
    '13-attack-mobile-evasion-compound.png',
    '《イベイジョン》',
  ),
  sourceScenario(
    'attack-desktop-guard-compound',
    'desktop',
    '14-attack-desktop-guard-compound.png',
    'ガード・リアクション放棄',
  ),
  sourceScenario(
    'attack-mobile-guard-compound',
    'mobile',
    '15-attack-mobile-guard-compound.png',
    'ガード・リアクション放棄',
  ),
])

const COMPOUND_D10_GROUPS = Object.freeze({
  attack: Object.freeze({
    name: '攻撃力',
    fieldNames: Object.freeze(['攻撃力（ダイス）', '攻撃力（固定値）']),
  }),
  defence: Object.freeze({
    name: '装甲・軽減値',
    fieldNames: Object.freeze(['装甲・軽減値（ダイス）', '装甲・軽減値（固定値）']),
  }),
  guard: Object.freeze({
    name: 'ガード・装甲・軽減値',
    fieldNames: Object.freeze(['ガード・装甲・軽減値（ダイス）', 'ガード・装甲・軽減値（固定値）']),
  }),
})

const COMPOUND_D10_EXPECTED_GROUPS = Object.freeze({
  'attack-desktop-single': Object.freeze({ 攻撃力: 1, '装甲・軽減値': 1 }),
  'attack-mobile-single': Object.freeze({ 攻撃力: 1, '装甲・軽減値': 1 }),
  'attack-desktop-multi-combo': Object.freeze({ 攻撃力: 2, '装甲・軽減値': 2 }),
  'attack-mobile-multi-combo': Object.freeze({ 攻撃力: 2, '装甲・軽減値': 2 }),
  'attack-desktop-evasion-compound': Object.freeze({ 攻撃力: 1, '装甲・軽減値': 1 }),
  'attack-mobile-evasion-compound': Object.freeze({ 攻撃力: 1, '装甲・軽減値': 1 }),
  'attack-desktop-guard-compound': Object.freeze({ 攻撃力: 1, 'ガード・装甲・軽減値': 1 }),
  'attack-mobile-guard-compound': Object.freeze({ 攻撃力: 1, 'ガード・装甲・軽減値': 1 }),
})

const inlineCheckboxFrom = '<v-checkbox-btn v-model="showDetails" density="compact" class="h-50" />'
const inlineCheckboxTo = '<v-checkbox-btn v-model="showDetails" density="compact" inline class="h-50" />'

const settingFieldReplacement = (column, component) => replacement(
  `<v-col ${column} class="pb-2">${component}</v-col>`,
  `<v-col ${column} class="pb-2">${component.replace('density="compact"', 'density="comfortable"')}</v-col>`,
)

const settingTextField = (label) => `<v-text-field label="${label}" type="number" min="0" v-model.number="currentRequest.${label === '最小値' ? 'min' : 'max'}" :rules="${label === '最小値' ? 'minRule' : 'maxRule'}" variant="underlined" hide-details="auto" density="compact"/>`
const settingModeField = (label) => `<v-select label="${label}" v-model="currentRequest.mode" :items="modeItem" variant="underlined" hide-details="auto" density="compact"/>`

const settingTargets = (file, column) => target(file, [
  settingFieldReplacement(column, settingTextField('最小値')),
  settingFieldReplacement(column, settingTextField('最大値')),
  settingFieldReplacement(
    column.replace('cols="6"', 'cols="12"'),
    settingModeField('表示モード'),
  ),
])

const backtrackImportFrom = "    import { ref,reactive,watch } from 'vue';"
const backtrackImportTo = "    import { ref,reactive,useId,watch } from 'vue';"
const backtrackFormFrom = '    const form = ref();'
const backtrackFormTo = `${backtrackFormFrom}\n    const otherReductionGroupId = useId();`
const backtrackReductionFrom = `            <v-col md="3" cols="6" class="pb-2">
                <v-row dense>
                    <v-col cols="6" class="pr-0"><v-text-field label="その他減少量" suffix="D10+" type="number" min=0 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    <v-col cols="6" class="pl-0"><v-text-field type="number" min=0 v-model.number="currentParams.value" :rules="valueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                </v-row>
            </v-col>`
const backtrackReductionTo = `            <v-col md="3" cols="6" class="pb-2">
                <div
                    class="r23-other-reduction-group"
                    role="group"
                    :aria-labelledby="otherReductionGroupId"
                >
                    <span
                        :id="otherReductionGroupId"
                        class="r23-other-reduction-group__label"
                    >その他減少量</span>
                    <v-row dense>
                        <v-col cols="6" class="pr-0">
                            <v-text-field label="その他減少量（ダイス）" suffix="D10+" type="number" min=0 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                <template #label><span class="d-sr-only">その他減少量（ダイス）</span></template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="6" class="pl-0">
                            <v-text-field label="その他減少量（固定値）" type="number" min=0 v-model.number="currentParams.value" :rules="valueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                <template #label><span class="d-sr-only">その他減少量（固定値）</span></template>
                            </v-text-field>
                        </v-col>
                    </v-row>
                </div>
            </v-col>`
const backtrackStyleAnchorFrom = '\n</template>\n'
const backtrackStyleAnchorTo = `
</template>

<style scoped>
.r23-other-reduction-group {
    position: relative;
}
.r23-other-reduction-group__label {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    z-index: 1;
    pointer-events: none;
    font-size: 0.75rem;
    line-height: 1.333;
}
</style>`
const backtrackAlignedReductionTo = backtrackReductionTo.replace(
  'class="r23-other-reduction-group__label"',
  'class="r23-other-reduction-group__label text-caption text-medium-emphasis"',
)
const backtrackAlignedStyleAnchorTo = `
</template>

<style scoped>
.r23-other-reduction-group {
    position: relative;
}
.r23-other-reduction-group__label {
    position: absolute;
    inset-block-start: 4px;
    inset-inline-start: 0;
    z-index: 1;
    pointer-events: none;
}
</style>`
const backtrackPositionedStyleAnchorTo = backtrackAlignedStyleAnchorTo.replace(
  'inset-block-start: 4px;',
  'inset-block-start: 12px;',
)
const backtrackFloatingAlignedStyleAnchorTo = backtrackAlignedStyleAnchorTo.replace(
  'inset-block-start: 4px;',
  'inset-block-start: -4px;',
)

const attackCompoundImportFrom = "    import { onUnmounted, reactive, ref, watch } from 'vue';"
const attackCompoundImportTo = "    import { onUnmounted, reactive, ref, useId, watch } from 'vue';"
const attackCompoundFormFrom = '    const form = ref();'
const attackCompoundFormTo = `${attackCompoundFormFrom}\n    const attackPowerGroupId = useId();`
const attackCompoundBlockFrom = `                <v-col md="3" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="攻撃力" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="attackDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="attackValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>`
const attackCompoundBlockTo = `                <v-col md="3" cols="12" class="pb-2">
                    <div
                        class="r23-compound-d10-group"
                        role="group"
                        :aria-labelledby="attackPowerGroupId"
                    >
                        <span
                            :id="attackPowerGroupId"
                            class="r23-compound-d10-group__label text-caption text-medium-emphasis"
                        >攻撃力</span>
                        <v-row dense>
                            <v-col cols="6" class="pr-0">
                                <v-text-field label="攻撃力（ダイス）" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="attackDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                    <template #label><span class="d-sr-only">攻撃力（ダイス）</span></template>
                                </v-text-field>
                            </v-col>
                            <v-col cols="6" class="pl-0">
                                <v-text-field label="攻撃力（固定値）" type="number" v-model.number="currentParams.damage.value" :rules="attackValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                    <template #label><span class="d-sr-only">攻撃力（固定値）</span></template>
                                </v-text-field>
                            </v-col>
                        </v-row>
                    </div>
                </v-col>`

const defenceCompoundImportFrom = "    import { onUnmounted, reactive, ref, watch } from 'vue';"
const defenceCompoundImportTo = "    import { onUnmounted, reactive, ref, useId, watch } from 'vue';"
const defenceCompoundFormFrom = '    const form = ref();'
const defenceCompoundFormTo = `${defenceCompoundFormFrom}\n    const defenceReductionGroupId = useId();`
const defenceDodgeBlockFrom = `                <v-col md="3" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="装甲・軽減値" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>`
const defenceDodgeBlockTo = `                <v-col md="3" cols="12" class="pb-2">
                    <div
                        class="r23-compound-d10-group"
                        role="group"
                        :aria-labelledby="defenceReductionGroupId"
                    >
                        <span
                            :id="defenceReductionGroupId"
                            class="r23-compound-d10-group__label text-caption text-medium-emphasis"
                        >装甲・軽減値</span>
                        <v-row dense>
                            <v-col cols="6" class="pr-0">
                                <v-text-field label="装甲・軽減値（ダイス）" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                    <template #label><span class="d-sr-only">装甲・軽減値（ダイス）</span></template>
                                </v-text-field>
                            </v-col>
                            <v-col cols="6" class="pl-0">
                                <v-text-field label="装甲・軽減値（固定値）" type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                    <template #label><span class="d-sr-only">装甲・軽減値（固定値）</span></template>
                                </v-text-field>
                            </v-col>
                        </v-row>
                    </div>
                </v-col>`
const defenceEvasionBlockFrom = `                <v-col md="4" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="装甲・軽減値" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>`
const defenceEvasionBlockTo = defenceDodgeBlockTo.replace('md="3"', 'md="4"')
const defenceGuardBlockFrom = `            <v-row v-if="currentParams.mode=='ガード・リアクション放棄'" dense class="pt-2 ma-0">
                <v-col cols="6" class="pr-0"><v-text-field label="ガード・装甲・軽減値" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            </v-row>`
const defenceGuardBlockTo = `            <v-row v-if="currentParams.mode=='ガード・リアクション放棄'" dense class="r23-compound-d10-group r23-compound-d10-group--direct-row pt-2 ma-0" role="group" :aria-labelledby="defenceReductionGroupId">
                <span
                    :id="defenceReductionGroupId"
                    class="r23-compound-d10-group__label text-caption text-medium-emphasis"
                >ガード・装甲・軽減値</span>
                <v-col cols="6" class="pr-0">
                    <v-text-field label="ガード・装甲・軽減値（ダイス）" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                        <template #label><span class="d-sr-only">ガード・装甲・軽減値（ダイス）</span></template>
                    </v-text-field>
                </v-col>
                <v-col cols="6" class="pl-0">
                    <v-text-field label="ガード・装甲・軽減値（固定値）" type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                        <template #label><span class="d-sr-only">ガード・装甲・軽減値（固定値）</span></template>
                    </v-text-field>
                </v-col>
            </v-row>`
const compoundStyleAnchorFrom = '\n</template>\n'
const compoundStyleAnchorTo = `
</template>

<style scoped>
.r23-compound-d10-group {
    position: relative;
}
.r23-compound-d10-group__label {
    position: absolute;
    inset-block-start: -4px;
    inset-inline-start: 0;
    z-index: 1;
    pointer-events: none;
}
</style>`

export const SOURCE_PROTOTYPE_VARIANTS = Object.freeze({
  'advanced-setting-inline-source': sourcePrototype(
    'advanced-setting-inline-source',
    '明示的な inline prop だけで「高度な設定」checkboxの旧レイアウトを再現できるかを検証する。',
    [
      target('src/features/check/ui/ScoreForm.vue', [
        replacement(inlineCheckboxFrom, inlineCheckboxTo),
      ]),
      target('src/features/attack/ui/AttackForm.vue', [
        replacement(inlineCheckboxFrom, inlineCheckboxTo),
      ]),
      target('src/features/attack/ui/DefenceForm.vue', [
        replacement(inlineCheckboxFrom, inlineCheckboxTo),
      ]),
    ],
    [...SETTING_SCENARIOS],
    {
      type: 'advanced-checkbox',
      expectedCheckboxesByRoute: Object.freeze({ '/check': 1, '/attack': 2 }),
    },
  ),
  'setting-form-comfortable-source': sourcePrototype(
    'setting-form-comfortable-source',
    '最小値・最大値・表示モードだけを public density API の comfortable に変更してgeometryを測定する。',
    [
      settingTargets('src/features/check/ui/SettingForm.vue', 'md="4" cols="6"'),
      settingTargets('src/features/attack/ui/ScoreSettingForm.vue', 'cols="6"'),
      settingTargets('src/features/attack/ui/DamageSettingForm.vue', 'cols="6"'),
    ],
    [...SETTING_SCENARIOS],
    {
      type: 'setting-geometry',
      labels: Object.freeze(['最小値', '最大値', '表示モード']),
    },
  ),
  'backtrack-compound-label-source': sourcePrototype(
    'backtrack-compound-label-source',
    '既存の6/6列を維持し、app-owned group labelと個別accessible nameを追加する。',
    [
      target('src/features/backtrack/ui/BacktrackForm.vue', [
        replacement(backtrackImportFrom, backtrackImportTo),
        replacement(backtrackFormFrom, backtrackFormTo),
        replacement(backtrackReductionFrom, backtrackReductionTo),
        replacement(backtrackStyleAnchorFrom, backtrackStyleAnchorTo),
      ]),
    ],
    [...BACKTRACK_SCENARIOS],
    {
      type: 'compound-label',
      groupName: 'その他減少量',
      fieldNames: Object.freeze(['その他減少量（ダイス）', 'その他減少量（固定値）']),
    },
  ),
  'backtrack-compound-label-aligned-source': sourcePrototype(
    'backtrack-compound-label-aligned-source',
    'UI-06 revision 2。既存のcompound構造とaccessible nameを維持し、Vuetify utility classと4pxの位置調整だけで視覚labelを隣接labelへ寄せる。',
    [
      target('src/features/backtrack/ui/BacktrackForm.vue', [
        replacement(backtrackImportFrom, backtrackImportTo),
        replacement(backtrackFormFrom, backtrackFormTo),
        replacement(backtrackReductionFrom, backtrackAlignedReductionTo),
        replacement(backtrackStyleAnchorFrom, backtrackAlignedStyleAnchorTo),
      ]),
    ],
    [...BACKTRACK_SCENARIOS],
    {
      type: 'compound-label',
      groupName: 'その他減少量',
      fieldNames: Object.freeze(['その他減少量（ダイス）', 'その他減少量（固定値）']),
    },
  ),
  'backtrack-compound-label-positioned-source': sourcePrototype(
    'backtrack-compound-label-positioned-source',
    'UI-06 revision 3。revision 2のsemantic structure、accessible name、Vuetify utility typographyを維持し、視覚labelのblock-startだけを4pxから12pxへ変更する。',
    [
      target('src/features/backtrack/ui/BacktrackForm.vue', [
        replacement(backtrackImportFrom, backtrackImportTo),
        replacement(backtrackFormFrom, backtrackFormTo),
        replacement(backtrackReductionFrom, backtrackAlignedReductionTo),
        replacement(backtrackStyleAnchorFrom, backtrackPositionedStyleAnchorTo),
      ]),
    ],
    [...BACKTRACK_SCENARIOS],
    {
      type: 'compound-label',
      groupName: 'その他減少量',
      fieldNames: Object.freeze(['その他減少量（ダイス）', 'その他減少量（固定値）']),
    },
  ),
  'backtrack-compound-label-floating-aligned-source': sourcePrototype(
    'backtrack-compound-label-floating-aligned-source',
    'UI-06 revision 4。revision 2のsemantic structure、accessible name、Vuetify utility typographyを維持し、校正済みfloating label計測に基づいて視覚labelのblock-startだけを4pxから-4pxへ変更する。',
    [
      target('src/features/backtrack/ui/BacktrackForm.vue', [
        replacement(backtrackImportFrom, backtrackImportTo),
        replacement(backtrackFormFrom, backtrackFormTo),
        replacement(backtrackReductionFrom, backtrackAlignedReductionTo),
        replacement(backtrackStyleAnchorFrom, backtrackFloatingAlignedStyleAnchorTo),
      ]),
    ],
    [...BACKTRACK_SCENARIOS],
    {
      type: 'compound-label',
      groupName: 'その他減少量',
      fieldNames: Object.freeze(['その他減少量（ダイス）', 'その他減少量（固定値）']),
    },
  ),
  'attack-compound-d10-source': sourcePrototype(
    'attack-compound-d10-source',
    'Attack / DefenceのD10+固定値compound inputを、Backtrack UI-06と同じshared label + individual accessible nameへ変更し、既存visual geometryを維持できるか検証する。',
    [
      target('src/features/attack/ui/AttackForm.vue', [
        replacement(attackCompoundImportFrom, attackCompoundImportTo),
        replacement(attackCompoundFormFrom, attackCompoundFormTo),
        replacement(attackCompoundBlockFrom, attackCompoundBlockTo),
        replacement(compoundStyleAnchorFrom, compoundStyleAnchorTo),
      ]),
      target('src/features/attack/ui/DefenceForm.vue', [
        replacement(defenceCompoundImportFrom, defenceCompoundImportTo),
        replacement(defenceCompoundFormFrom, defenceCompoundFormTo),
        replacement(defenceDodgeBlockFrom, defenceDodgeBlockTo),
        replacement(defenceEvasionBlockFrom, defenceEvasionBlockTo),
        replacement(defenceGuardBlockFrom, defenceGuardBlockTo),
        replacement(compoundStyleAnchorFrom, compoundStyleAnchorTo),
      ]),
    ],
    [...ATTACK_COMPOUND_SCENARIOS],
    {
      type: 'compound-d10-consistency',
      groups: COMPOUND_D10_GROUPS,
      expectedGroupsByScenario: COMPOUND_D10_EXPECTED_GROUPS,
    },
  ),
})

export function listSourcePrototypeVariants() {
  return Object.values(SOURCE_PROTOTYPE_VARIANTS)
}

export function getSourcePrototypeVariant(variantId) {
  const variant = SOURCE_PROTOTYPE_VARIANTS[variantId]
  if (!variant) {
    throw new Error(`unknown source prototype variant: ${variantId}`)
  }
  return variant
}

export function validateSourcePrototypeDefinitions(
  variants = SOURCE_PROTOTYPE_VARIANTS,
) {
  const errors = []
  const ids = new Set()
  for (const [key, variant] of Object.entries(variants)) {
    if (key !== variant.id) {
      errors.push(`variant key does not match id: ${key}`)
    }
    if (ids.has(variant.id)) {
      errors.push(`duplicate source prototype id: ${variant.id}`)
    }
    ids.add(variant.id)
    if (!Array.isArray(variant.targets) || variant.targets.length === 0) {
      errors.push(`source prototype has no targets: ${variant.id}`)
    }
    const files = new Set()
    for (const targetDefinition of variant.targets ?? []) {
      if (files.has(targetDefinition.file)) {
        errors.push(`duplicate source target: ${variant.id} / ${targetDefinition.file}`)
      }
      files.add(targetDefinition.file)
      if (!Array.isArray(targetDefinition.replacements) || targetDefinition.replacements.length === 0) {
        errors.push(`source target has no replacements: ${variant.id} / ${targetDefinition.file}`)
      }
      for (const candidate of targetDefinition.replacements ?? []) {
        if (typeof candidate.from !== 'string' || candidate.from.length === 0) {
          errors.push(`empty replacement source: ${variant.id} / ${targetDefinition.file}`)
        }
        if (typeof candidate.to !== 'string') {
          errors.push(`invalid replacement target: ${variant.id} / ${targetDefinition.file}`)
        }
        if (!Number.isInteger(candidate.expectedCount) || candidate.expectedCount < 1) {
          errors.push(`invalid replacement count: ${variant.id} / ${targetDefinition.file}`)
        }
      }
    }
    if (!Array.isArray(variant.scenarios) || variant.scenarios.length === 0) {
      errors.push(`source prototype has no scenarios: ${variant.id}`)
    } else {
      const resolvedScenarios = []
      const knownScenarios = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]))
      for (const entry of variant.scenarios) {
        const scenario = typeof entry === 'string' ? knownScenarios.get(entry) : entry
        if (!scenario) {
          errors.push(`unknown source prototype scenario: ${variant.id} / ${String(entry)}`)
          continue
        }
        resolvedScenarios.push(scenario)
      }
      if (resolvedScenarios.length === variant.scenarios.length) {
        for (const scenarioError of validateScenarioDefinitions(resolvedScenarios, VIEWPORTS)) {
          errors.push(`invalid source prototype scenario: ${variant.id} / ${scenarioError}`)
        }
      }
    }
  }
  return errors
}

const definitionErrors = validateSourcePrototypeDefinitions()
if (definitionErrors.length > 0) {
  throw new Error(`Invalid source prototype definitions:\n${definitionErrors.join('\n')}`)
}
