<script setup lang="ts">
import InputForm from './InputForm.vue'
import RangePlanNotice from '@/components/RangePlanNotice.vue'
import { mdiTuneVariant } from '@mdi/js'
import type { DifficultyInput, ScoreInput } from '@/domain/CalculationInputs'
import type { CalculationFeedbackState } from '@/runtime/CalculationFeedbackTypes'
import type {
  CheckAdvancedSettingsChange,
  CheckAdvancedSettingsEnabled,
} from '../model/CheckAdvancedSettings'

defineProps<{
  difficulty: DifficultyInput
  scoreParams: {
    action: Partial<ScoreInput>
    reaction: Partial<ScoreInput>
  }
  advancedSettingsEnabled: CheckAdvancedSettingsEnabled
  rangeFeedback: CalculationFeedbackState
}>()

const emit = defineEmits<{
  'dfclty-validated': [difficulty: DifficultyInput]
  'score-validated': [payload: { side: 'action' | 'reaction'; params: Partial<ScoreInput> }]
  'advanced-settings-changed': [change: CheckAdvancedSettingsChange]
}>()

const onDfcltyValidated = (difficulty: DifficultyInput) => {
  emit('dfclty-validated', difficulty)
}

const onScoreValidated = (payload: { side: 'action' | 'reaction'; params: Partial<ScoreInput> }) => {
  emit('score-validated', payload)
}

const onAdvancedSettingsChanged = (change: CheckAdvancedSettingsChange) => {
  emit('advanced-settings-changed', change)
}
</script>

<template>
  <v-card class="ma-0">
    <v-card-title><v-icon :icon="mdiTuneVariant" /> 判定条件</v-card-title>
    <v-divider class="mx-2" />
    <v-card-text class="pa-0 text-md-body-1 text-caption">
      <RangePlanNotice :feedback="rangeFeedback" />
      <InputForm
        :difficulty="difficulty"
        :score-params="scoreParams"
        :advanced-settings-enabled="advancedSettingsEnabled"
        @dfclty-validated="onDfcltyValidated"
        @score-validated="onScoreValidated"
        @advanced-settings-changed="onAdvancedSettingsChanged"
      />
    </v-card-text>
  </v-card>
</template>
