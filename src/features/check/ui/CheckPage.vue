<script setup lang="ts">
    import { useCalculationClient } from '@/plugins/calculationClient'
    import { useCheck } from '../model/useCheck'
    import InputPanel from './InputPanel.vue'
    import ChartPanel from './ChartPanel.vue'
    import SummaryPanel from './SummaryPanel.vue'
    import LayoutFootprintRow from '@/shared/layout/LayoutFootprintRow.vue'

    const calculationClient = useCalculationClient()
    const {
        difficulty,
        scoreParams,
        advancedSettingsEnabled,
        calculationRecord,
        resultReady,
        displayRequest,
        presentation,
        rangeFeedback,
        displayFeedback,
        onDifficultyValidated,
        onScoreValidated,
        onAdvancedSettingsChanged,
        onDisplayValidated,
    } = await useCheck({ calculationClient })
</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :difficulty="difficulty"
            :scoreParams="scoreParams"
            :advanced-settings-enabled="advancedSettingsEnabled"
            :rangeFeedback="rangeFeedback"
            @difficulty-validated="onDifficultyValidated"
            @score-validated="onScoreValidated"
            @advanced-settings-changed="onAdvancedSettingsChanged"
        /></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel
            :difficulty="difficulty"
            :displayRequest="displayRequest"
            :presentation="presentation"
            :displayFeedback="displayFeedback"
            :preserve-previous-frame="rangeFeedback.status === 'loading'"
            @display-validated="onDisplayValidated"
        /></v-col></v-row>
        <LayoutFootprintRow
            :ready="resultReady"
            :preserve-footprint="rangeFeedback.status === 'loading'"
        >
            <v-col cols="12"><SummaryPanel
                :record="calculationRecord"
                :replacement-loading="rangeFeedback.status === 'loading'"
            /></v-col>
        </LayoutFootprintRow>
    </v-container>
</template>
