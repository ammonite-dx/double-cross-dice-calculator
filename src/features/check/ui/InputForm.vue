<script setup lang="ts">
import DifficultyForm from './DifficultyForm.vue'
import ScoreForm from './ScoreForm.vue'
import type { DifficultyInput, ScoreInput } from '@/domain/CalculationInputs'
import type { DraftValidation } from '@/shared/validation/DraftValidation'
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
  'difficulty-validation-state': [state: DraftValidation<DifficultyInput>]
  'score-validation-state': [payload: {
    side: CheckScoreSide
    state: DraftValidation<Partial<ScoreInput>>
  }]
  'advanced-settings-changed': [change: CheckAdvancedSettingsChange]
}>()

const onDifficultyValidationState = (state: DraftValidation<DifficultyInput>) => {
  emit('difficulty-validation-state', state)
}

const onScoreValidationState = (
  side: CheckScoreSide,
  state: DraftValidation<Partial<ScoreInput>>,
) => {
  emit('score-validation-state', { side, state })
}

const onAdvancedSettingsChanged = (side: CheckScoreSide, enabled: boolean) => {
  emit('advanced-settings-changed', { side, enabled })
}
</script>

<template>
  <v-container class="pa-4">
    <DifficultyForm :difficulty="difficulty" @validation-state="onDifficultyValidationState" />
    <ScoreForm
      side="action"
      :params="scoreParams.action"
      :advanced-settings-enabled="advancedSettingsEnabled.action"
      @validation-state="(state) => onScoreValidationState('action', state)"
      @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('action', enabled)"
    />
    <ScoreForm
      v-if="difficulty.opposed"
      side="reaction"
      :params="scoreParams.reaction"
      :advanced-settings-enabled="advancedSettingsEnabled.reaction"
      @validation-state="(state) => onScoreValidationState('reaction', state)"
      @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('reaction', enabled)"
    />
  </v-container>
</template>
