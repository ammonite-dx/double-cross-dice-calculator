<script setup lang="ts">
import { getChartColor } from '@/shared/theme/ChartPalette'
import ComboForm from './ComboForm.vue'
import { mdiChevronUp, mdiChevronDown, mdiContentCopy, mdiDelete, mdiPlus } from '@mdi/js'
import type { AttackComboParams, AttackComboSide } from '../model/AttackComboState'
import type { AttackAdvancedSettingsChange } from '../model/AttackAdvancedSettings'
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

function onNameChanged(combo: AttackUiCombo, name: string) {
  emit('combo-name-changed', { id: combo.id, name })
}

function onVisibilityChanged(combo: AttackUiCombo, show: boolean) {
  emit('combo-visibility-changed', { id: combo.id, show })
}

function onAdvancedSettingsChanged(
  combo: AttackUiCombo,
  change: { side: AttackComboSide; enabled: boolean },
) {
  emit('combo-advanced-settings-changed', {
    id: combo.id,
    side: change.side,
    enabled: change.enabled,
  })
}

function onSideValidated(combo: AttackUiCombo, change: ComboSideChange) {
  if (change.side === 'action') {
    emit('combo-side-validated', {
      id: combo.id,
      side: 'action',
      snapshot: change.snapshot,
    })
  } else {
    emit('combo-side-validated', {
      id: combo.id,
      side: 'reaction',
      snapshot: change.snapshot,
    })
  }
}
</script>

<template>
  <template v-for="combo in combos" :key="combo.id">
    <v-container class="pa-4">
      <v-row class="ma-0">
        <v-col sm="9" cols="7" class="pl-0 pr-3 pb-0"><v-text-field label="コンボ名" :model-value="combo.name" @update:model-value="(name) => onNameChanged(combo, name)" variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption" /></v-col>
        <v-col sm="3" cols="5" class="px-0">
          <v-row class="ma-0">
            <v-col cols="4" align-self="center" class="px-1 py-0">
              <v-btn v-if="combo.show" variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="onVisibilityChanged(combo, false)"><v-icon color="white" :icon="mdiChevronUp" /><span class="hidden-sm-and-down" style="color:white">畳む</span></v-btn>
              <v-btn v-else variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="onVisibilityChanged(combo, true)"><v-icon color="white" :icon="mdiChevronDown" /><span class="hidden-sm-and-down" style="color:white">開く</span></v-btn>
            </v-col>
            <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="emit('combo-duplicate', combo.id)"><v-icon color="white" :icon="mdiContentCopy" /><span class="hidden-sm-and-down" style="color:white">複製</span></v-btn></v-col>
            <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="emit('combo-remove', combo.id)"><v-icon color="white" :icon="mdiDelete" /><span class="hidden-sm-and-down" style="color:white">削除</span></v-btn></v-col>
          </v-row>
        </v-col>
      </v-row>
      <ComboForm
        v-if="combo.show"
        :params="combo.params"
        :combo-color="getChartColor(combo.id)"
        :advanced-settings-enabled="combo.advancedSettingsEnabled"
        @advanced-settings-changed="(change) => onAdvancedSettingsChanged(combo, change)"
        @side-validated="(change) => onSideValidated(combo, change)"
      />
    </v-container>
    <v-divider class="mx-8" />
  </template>
  <v-container class="px-3 py-1">
    <v-btn variant="flat" block @click="emit('combo-add')" class="text-md-body-1 text-caption"><v-icon :icon="mdiPlus" />コンボを追加</v-btn>
  </v-container>
</template>
