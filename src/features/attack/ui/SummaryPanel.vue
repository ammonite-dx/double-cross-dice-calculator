<script setup lang="ts">
    import { shallowRef, watch } from 'vue'
    import SummaryTable from './SummaryTable.vue';
    import { mdiFileChartOutline } from '@mdi/js'
    import type { AttackUiCombo } from '../model/AttackControllerTypes'
    import type {
        AttackDisplayPresentation,
        AttackScoreDisplayPresentation,
    } from '../model/AttackPresentationTypes'

    const props = defineProps<{
        combos: readonly AttackUiCombo[]
        presentation: AttackDisplayPresentation | null
        scorePresentation: AttackScoreDisplayPresentation | null
        ready: boolean
        replacementLoading: boolean
    }>()

    type SummaryCombo = Pick<AttackUiCombo, 'id' | 'name'>

    interface AttackSummaryFrame {
        readonly combos: readonly SummaryCombo[]
        readonly presentation: AttackDisplayPresentation
        readonly scorePresentation: AttackScoreDisplayPresentation | null
    }

    const displayedFrame = shallowRef<AttackSummaryFrame | null>(null)

    watch(
        () => [
            props.ready,
            props.combos,
            props.presentation,
            props.scorePresentation,
            props.replacementLoading,
        ] as const,
        ([ready, combos, presentation, scorePresentation, replacementLoading]) => {
            if (replacementLoading) {
                return
            }

            if (ready && presentation?.status === 'ready') {
                displayedFrame.value = Object.freeze({
                    combos: Object.freeze(combos.map(({ id, name }) =>
                        Object.freeze({ id, name })
                    )),
                    presentation,
                    scorePresentation,
                })
            } else {
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
                    :combos="displayedFrame.combos"
                    :presentation="displayedFrame.presentation"
                    :scorePresentation="displayedFrame.scorePresentation"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
