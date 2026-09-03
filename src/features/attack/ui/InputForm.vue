<script setup>
    import { getChartColor } from '@/shared/theme/ChartPalette';
    import ComboForm from './ComboForm.vue';
    import { mdiChevronUp, mdiChevronDown, mdiContentCopy, mdiDelete, mdiPlus } from '@mdi/js'

    const props = defineProps({
        combos: {
            type: Array,
            required: true,
        },
    });
    const emit = defineEmits([
        'combo-add',
        'combo-duplicate',
        'combo-remove',
        'combo-name-changed',
        'combo-visibility-changed',
        'combo-details-changed',
        'combo-side-validated',
    ]);

    function onNameChanged(combo, name) {
        emit('combo-name-changed', {id: combo.id, name});
    }

    function onVisibilityChanged(combo, show) {
        emit('combo-visibility-changed', {id: combo.id, show});
    }

    function onDetailsChanged(combo, change) {
        emit('combo-details-changed', {
            id: combo.id,
            side: change.side,
            value: change.value,
        });
    }

    function onSideValidated(combo, change) {
        emit('combo-side-validated', {
            id: combo.id,
            side: change.side,
            snapshot: change.snapshot,
        });
    }
</script>

<template>
    <template v-for="combo in props.combos" :key="combo.id">
        <v-container class="pa-4">
            <v-row class="ma-0">
                <v-col sm="9" cols="7" class="pl-0 pr-3 pb-0"><v-text-field label="コンボ名" :model-value="combo.name" @update:model-value="(name) => onNameChanged(combo, name)" variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption"></v-text-field></v-col>
                <v-col sm="3" cols="5" class="px-0">
                    <v-row class="ma-0">
                        <v-col cols="4" align-self="center" class="px-1 py-0">
                            <v-btn v-if="combo.show" variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="onVisibilityChanged(combo, false)"><v-icon color="white" :icon="mdiChevronUp" /><span class="hidden-sm-and-down" style="color:white">畳む</span></v-btn>
                            <v-btn v-else variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="onVisibilityChanged(combo, true)"><v-icon color="white" :icon="mdiChevronDown"/><span class="hidden-sm-and-down" style="color:white">開く</span></v-btn>
                        </v-col>
                        <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="emit('combo-duplicate', combo.id)"><v-icon color="white" :icon="mdiContentCopy"/><span class="hidden-sm-and-down" style="color:white">複製</span></v-btn></v-col>
                        <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color="getChartColor(combo.id)" @click="emit('combo-remove', combo.id)"><v-icon color="white" :icon="mdiDelete"/><span class="hidden-sm-and-down" style="color:white">削除</span></v-btn></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <ComboForm
                v-if="combo.show"
                :params="combo.params"
                :comboColor="getChartColor(combo.id)"
                :showDetails="combo.showDetails"
                @show-details="(change) => onDetailsChanged(combo, change)"
                @side-validated="(change) => onSideValidated(combo, change)"
            />
        </v-container>
        <v-divider class="mx-8"/>
    </template>
    <v-container class="px-3 py-1">
        <v-btn variant="flat" block @click="emit('combo-add')" class="text-md-body-1 text-caption"><v-icon :icon="mdiPlus"/>コンボを追加</v-btn>
    </v-container>
</template>
