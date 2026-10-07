<script setup lang="ts">
import AttackForm from './AttackForm.vue'
import DefenceForm from './DefenceForm.vue'
import type { AttackComboParams, AttackComboSide } from '../model/AttackComboState'
import type { DraftValidation } from '@/shared/validation/DraftValidation'

defineProps<{
  params: AttackComboParams
  comboColor: string
  advancedSettingsEnabled: {
    action: boolean
    reaction: boolean
  }
}>()

type SideValidation =
  | { side: 'action'; state: DraftValidation<AttackComboParams['action']> }
  | { side: 'reaction'; state: DraftValidation<AttackComboParams['reaction']> }

const emit = defineEmits<{
  'side-validation-state': [change: SideValidation]
  'advanced-settings-changed': [change: { side: AttackComboSide; enabled: boolean }]
}>()

const onSideValidationState = (
  side: AttackComboSide,
  state: DraftValidation<AttackComboParams['action'] | AttackComboParams['reaction']>,
) => {
  if (side === 'action') {
    emit('side-validation-state', {
      side,
      state: state as DraftValidation<AttackComboParams['action']>,
    })
  } else {
    emit('side-validation-state', {
      side,
      state: state as DraftValidation<AttackComboParams['reaction']>,
    })
  }
}

const onAdvancedSettingsChanged = (side: AttackComboSide, enabled: boolean) => {
  emit('advanced-settings-changed', { side, enabled })
}
</script>

<template>
  <AttackForm
    :params="params.action"
    :combo-color="comboColor"
    :advanced-settings-enabled="advancedSettingsEnabled.action"
    @validation-state="(state) => onSideValidationState('action', state)"
    @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('action', enabled)"
  />
  <DefenceForm
    :params="params.reaction"
    :combo-color="comboColor"
    :advanced-settings-enabled="advancedSettingsEnabled.reaction"
    @validation-state="(state) => onSideValidationState('reaction', state)"
    @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('reaction', enabled)"
  />
</template>
