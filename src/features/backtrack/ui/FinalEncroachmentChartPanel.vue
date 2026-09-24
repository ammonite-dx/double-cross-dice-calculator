<script setup lang="ts">

    import { shallowRef, watch } from 'vue'
    import FinalEncroachmentChart from './FinalEncroachmentChart.vue';
    import type { BacktrackPresentation } from '../model/BacktrackPresentation'
    import { mdiChartLine } from '@mdi/js'

    const props = defineProps<{
        presentation: BacktrackPresentation | null
        preservePreviousFrame: boolean
    }>();
    const displayedPresentation = shallowRef<BacktrackPresentation | null>(null)

    // Keep only the last ready visual frame while a replacement is pending;
    // this does not restore stale application state as the current result.
    watch(
        () => [props.presentation, props.preservePreviousFrame] as const,
        ([presentation, preservePreviousFrame]) => {
            if (presentation !== null) {
                displayedPresentation.value = presentation
            } else if (!preservePreviousFrame) {
                displayedPresentation.value = null
            }
        },
        { immediate: true },
    )

</script>

<template>
    <v-card v-if="displayedPresentation !== null" class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> 最終侵蝕率分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <v-row class="ma-0">
                    <v-col md="4" cols="6" class="px-1 py-2"><FinalEncroachmentChart :chart="displayedPresentation.charts.single"/></v-col>
                    <v-col md="4" cols="6" class="pa-1 py-2"><FinalEncroachmentChart :chart="displayedPresentation.charts.double"/></v-col>
                    <v-col md="4" cols="6" class="pa-1 py-2"><FinalEncroachmentChart :chart="displayedPresentation.charts.second"/></v-col>
                </v-row>
            </v-card-text>
        </v-container>
    </v-card>
</template>
