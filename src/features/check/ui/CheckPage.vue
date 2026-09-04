<script setup>
    import { inject } from 'vue'
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/runtime/CalculationClient'
    import { useCheck } from '../model/useCheck'
    import InputPanel from './InputPanel.vue'
    import ChartPanel from './ChartPanel.vue'
    import SummaryPanel from './SummaryPanel.vue'

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    )
    const {
        difficulty,
        scoreParams,
        scoreSummary,
        resultReady,
        displayRequest,
        presentation,
        rangeFeedback,
        displayFeedback,
        onDifficultyValidated,
        onScoreValidated,
        onDisplayValidated,
    } = await useCheck({ calculationClient })
</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :difficulty="difficulty"
            :scoreParams="scoreParams"
            :rangeFeedback="rangeFeedback"
            @dfclty-validated="onDifficultyValidated"
            @score-validated="onScoreValidated"
        /></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel
            :difficulty="difficulty"
            :displayRequest="displayRequest"
            :presentation="presentation"
            :displayFeedback="displayFeedback"
            @display-validated="onDisplayValidated"
        /></v-col></v-row>
        <v-row v-if="resultReady"><v-col cols="12"><SummaryPanel
            :difficulty="difficulty"
            :scoreSummary="scoreSummary"
        /></v-col></v-row>
    </v-container>
</template>
