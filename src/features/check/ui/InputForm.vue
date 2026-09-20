<script setup lang="ts">
import DifficultyForm from './DifficultyForm.vue'
import ScoreForm from './ScoreForm.vue'
import type { DifficultyInput, ScoreInput } from '@/domain/CalculationInputs'
import type {
  CheckAdvancedSettingsChange,
  CheckAdvancedSettingsEnabled,
  CheckScoreSide,
} from '../model/CheckAdvancedSettings'

defineProps<{
  difficulty: DifficultyInput
  scoreParams: {
    action: Partial<ScoreInput>
    reaction: Partial<ScoreInput>
  }
  advancedSettingsEnabled: CheckAdvancedSettingsEnabled
}>()

const emit = defineEmits<{
  'difficulty-validated': [difficulty: DifficultyInput]
  'score-validated': [payload: { side: CheckScoreSide; params: Partial<ScoreInput> }]
  'advanced-settings-changed': [change: CheckAdvancedSettingsChange]
}>()

const onDifficultyValidated = (difficulty: DifficultyInput) => {
  emit('difficulty-validated', difficulty)
}

const onScoreValidated = (side: CheckScoreSide, params: Partial<ScoreInput>) => {
  emit('score-validated', { side, params })
}

const onAdvancedSettingsChanged = (side: CheckScoreSide, enabled: boolean) => {
  emit('advanced-settings-changed', { side, enabled })
}
</script>

<template>
  <v-container class="pa-4">
    <DifficultyForm :difficulty="difficulty" @validated="onDifficultyValidated" />
    <ScoreForm
      side="action"
      :params="scoreParams.action"
      :advanced-settings-enabled="advancedSettingsEnabled.action"
      @validated="(params) => onScoreValidated('action', params)"
      @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('action', enabled)"
    />
    <ScoreForm
      v-if="difficulty.opposed"
      side="reaction"
      :params="scoreParams.reaction"
      :advanced-settings-enabled="advancedSettingsEnabled.reaction"
      @validated="(params) => onScoreValidated('reaction', params)"
      @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('reaction', enabled)"
    />
  </v-container>
</template>
