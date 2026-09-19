<script setup lang="ts">
import InputForm from './InputForm.vue'
import { mdiTuneVariant } from '@mdi/js'
import type { AttackAdvancedSettingsChange } from '../model/AttackAdvancedSettings'
import type { AttackComboParams } from '../model/AttackComboState'
import type { AttackUiCombo } from '../model/useAttack'

type ComboSideChange =
  | { side: 'action'; snapshot: AttackComboParams['action'] }
  | { side: 'reaction'; snapshot: AttackComboParams['reaction'] }

defineProps<{
  combos: ReadonlyArray<AttackUiCombo>
}>()

const emit = defineEmits<{
  'combo-add': []
  'combo-duplicate': [id: number | string]
  'combo-remove': [id: number | string]
  'combo-name-changed': [change: { id: number | string; name: string }]
  'combo-visibility-changed': [change: { id: number | string; show: boolean }]
  'combo-advanced-settings-changed': [change: AttackAdvancedSettingsChange]
  'combo-side-validated': [change: { id: number | string } & ComboSideChange]
}>()
</script>

<template>
  <v-card class="ma-0">
    <v-card-title><v-icon :icon="mdiTuneVariant" /> 判定条件</v-card-title>
    <v-divider class="mx-2" />
    <v-card-text class="pa-0 text-md-body-1 text-caption">
      <InputForm
        :combos="combos"
        @combo-add="emit('combo-add')"
        @combo-duplicate="(id) => emit('combo-duplicate', id)"
        @combo-remove="(id) => emit('combo-remove', id)"
        @combo-name-changed="(change) => emit('combo-name-changed', change)"
        @combo-visibility-changed="(change) => emit('combo-visibility-changed', change)"
        @combo-advanced-settings-changed="(change) => emit('combo-advanced-settings-changed', change)"
        @combo-side-validated="(change) => emit('combo-side-validated', change)"
      />
    </v-card-text>
  </v-card>
</template>
