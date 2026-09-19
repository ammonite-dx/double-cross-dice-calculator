<script setup lang="ts">
import { nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { getChartColor } from '@/shared/theme/ChartPalette'
import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate'
import {
  createScoreFeatureCompatibilityRule,
  createScoreFieldRules,
} from '@/shared/validation/ScoreInputRules'
import type { ScoreInput } from '@/domain/CalculationInputs'
import type { CheckScoreSide } from '../model/CheckAdvancedSettings'

const props = defineProps<{
  side: CheckScoreSide
  params: Partial<ScoreInput>
  advancedSettingsEnabled: boolean
}>()

const emit = defineEmits<{
  validated: [params: Partial<ScoreInput>]
  'advanced-settings-changed': [enabled: boolean]
}>()

const form = ref<{ validate?: () => Promise<{ valid?: boolean }> } | null>(null)
const backgroundColor = props.side === 'action' ? getChartColor(0) : getChartColor(1)
const sideText = props.side === 'action' ? 'アクション側' : 'リアクション側'
const toDraft = (params: Partial<ScoreInput>) => ({
  dice: params.dice ?? 0,
  critical: params.critical ?? 10,
  skill: params.skill ?? 0,
  yousei: params.yousei ?? 0,
  shihai: params.shihai ?? 0,
})
const currentParams = reactive(toDraft(props.params))
const validationGate = createLatestValidationGate()
let syncingProps = false
const scoreRules = createScoreFieldRules()
const diceRule = scoreRules.dice
const criticalRule = scoreRules.critical
const skillRule = scoreRules.skill
const youseiRule = [
  ...scoreRules.yousei,
  createScoreFeatureCompatibilityRule({
    field: 'yousei',
    getScore: () => currentParams,
  }),
]
const shihaiRule = [
  ...scoreRules.shihai,
  createScoreFeatureCompatibilityRule({
    field: 'shihai',
    getScore: () => currentParams,
  }),
]

watch(() => props.params, async (params) => {
  validationGate.invalidate()
  syncingProps = true
  Object.assign(currentParams, toDraft(params))
  await nextTick()
  syncingProps = false
}, { deep: true })

watch(currentParams, async () => {
  if (syncingProps) {
    return
  }
  const ticket = validationGate.begin()
  const draft = { ...currentParams }
  const validResult = await form.value?.validate?.()
  if (!validationGate.canCommit(ticket)) {
    return
  }
  if (validResult?.valid) {
    emit('validated', draft)
  }
})

function onAdvancedSettingsChanged(value: boolean) {
  validationGate.invalidate()
  emit('advanced-settings-changed', Boolean(value))
}

onUnmounted(() => validationGate.dispose())
</script>

<template>
  <v-row class="ma-0 px-1 py-0" :style="{ backgroundColor }" style="color:white">
    <v-col md="8" cols="6" class="pa-0 d-flex align-center">{{ sideText }}</v-col>
    <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption">
      <v-checkbox-btn
        :model-value="props.advancedSettingsEnabled"
        density="compact"
        inline
        class="h-50"
        label="高度な設定"
        @update:model-value="onAdvancedSettingsChanged"
      />
    </v-col>
  </v-row>
  <v-form ref="form" class="pa-1">
    <v-row dense class="pt-2 ma-0">
      <v-col cols="4"><v-text-field label="ダイス数" type="number" min=0 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" /></v-col>
      <v-col cols="4"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" /></v-col>
      <v-col cols="4"><v-text-field label="技能値" type="number" v-model.number="currentParams.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" /></v-col>
    </v-row>
    <v-row v-if="props.advancedSettingsEnabled" dense class="pt-2 ma-0">
      <v-col md="6" cols="12" class="pb-2"><v-text-field label="《妖精の手》等の回数" type="number" min=0 v-model.number="currentParams.yousei" :rules="youseiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" /></v-col>
      <v-col md="6" cols="12" class="pb-2"><v-text-field label="《支配の領域》の対象ダイス数" type="number" min=0 v-model.number="currentParams.shihai" :rules="shihaiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" /></v-col>
    </v-row>
  </v-form>
</template>
