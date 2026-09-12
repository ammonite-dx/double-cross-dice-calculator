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
  }
  return errors
}

const definitionErrors = validateSourcePrototypeDefinitions()
if (definitionErrors.length > 0) {
  throw new Error(`Invalid source prototype definitions:\n${definitionErrors.join('\n')}`)
}
