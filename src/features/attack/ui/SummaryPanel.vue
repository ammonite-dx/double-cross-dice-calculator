<script setup lang="ts">

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
    }>()

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiFileChartOutline"/> サマリー</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="px-6 py-0">
            <v-card-text class="pt-0 pb-2 text-md-body-1 text-caption">
                <SummaryTable
                    :combos="props.combos"
                    :presentation="props.presentation"
                    :scorePresentation="props.scorePresentation"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
