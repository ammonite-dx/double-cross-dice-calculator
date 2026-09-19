<script setup lang="ts">
    import { useCalculationClient } from '@/plugins/calculationClient'
    import { useCheck } from '../model/useCheck'
    import InputPanel from './InputPanel.vue'
    import ChartPanel from './ChartPanel.vue'
    import SummaryPanel from './SummaryPanel.vue'

    const calculationClient = useCalculationClient()
    const {
        difficulty,
        scoreParams,
        advancedSettingsEnabled,
        scoreStatistics,
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
            @dfclty-validated="onDifficultyValidated"
            @score-validated="onScoreValidated"
            @advanced-settings-changed="onAdvancedSettingsChanged"
        /></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel
            :difficulty="difficulty"
            :displayRequest="displayRequest"
            :presentation="presentation ?? undefined"
            :displayFeedback="displayFeedback"
            @display-validated="onDisplayValidated"
        /></v-col></v-row>
        <v-row v-if="resultReady"><v-col cols="12"><SummaryPanel
            :difficulty="difficulty"
            :scoreStatistics="scoreStatistics ?? undefined"
        /></v-col></v-row>
    </v-container>
</template>
