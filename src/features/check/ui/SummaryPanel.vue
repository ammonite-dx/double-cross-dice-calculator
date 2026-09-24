<script setup lang="ts">
    import { shallowRef, watch } from 'vue'
    import SummaryTable from './SummaryTable.vue';
    import { mdiFileChartOutline } from '@mdi/js'
    import type { CheckCalculationRecord } from '../model/CheckCalculationRecord'

    const props = defineProps<{
        record: CheckCalculationRecord | null
        replacementLoading: boolean
    }>()

    interface CheckSummaryFrame {
        readonly difficulty: CheckCalculationRecord['input']['difficulty']
        readonly scoreStatistics: CheckCalculationRecord['result']['scoreStatistics']
    }

    const displayedFrame = shallowRef<CheckSummaryFrame | null>(null)

    watch(
        () => [props.record, props.replacementLoading] as const,
        ([record, replacementLoading]) => {
            if (record !== null) {
                displayedFrame.value = Object.freeze({
                    difficulty: record.input.difficulty,
                    scoreStatistics: record.result.scoreStatistics,
                })
            } else if (!replacementLoading) {
                displayedFrame.value = null
            }
        },
        { immediate: true },
    )
</script>

<template>
    <v-card v-if="displayedFrame" class="ma-0">
        <v-card-title><v-icon :icon="mdiFileChartOutline"/> サマリー</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="px-6 py-0">
            <v-card-text class="pt-0 pb-2 text-md-body-1 text-caption">
                <SummaryTable
                    :difficulty="displayedFrame.difficulty"
                    :scoreStatistics="displayedFrame.scoreStatistics"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
