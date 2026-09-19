<script setup lang="ts">
import AttackForm from './AttackForm.vue'
import DefenceForm from './DefenceForm.vue'
import type { AttackComboParams, AttackComboSide } from '../model/AttackComboState'

defineProps<{
  params: AttackComboParams
  comboColor: string
  advancedSettingsEnabled: {
    action: boolean
    reaction: boolean
  }
}>()

type SideValidation =
  | { side: 'action'; snapshot: AttackComboParams['action'] }
  | { side: 'reaction'; snapshot: AttackComboParams['reaction'] }

const emit = defineEmits<{
  'side-validated': [change: SideValidation]
  'advanced-settings-changed': [change: { side: AttackComboSide; enabled: boolean }]
}>()

const onSideValidated = (side: AttackComboSide, snapshot: SideValidation['snapshot']) => {
  if (side === 'action') {
    emit('side-validated', { side, snapshot: snapshot as AttackComboParams['action'] })
  } else {
    emit('side-validated', { side, snapshot: snapshot as AttackComboParams['reaction'] })
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
    @validated="(snapshot) => onSideValidated('action', snapshot)"
    @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('action', enabled)"
  />
  <DefenceForm
    :params="params.reaction"
    :combo-color="comboColor"
    :advanced-settings-enabled="advancedSettingsEnabled.reaction"
    @validated="(snapshot) => onSideValidated('reaction', snapshot)"
    @advanced-settings-changed="(enabled) => onAdvancedSettingsChanged('reaction', enabled)"
  />
</template>
