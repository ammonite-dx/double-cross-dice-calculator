<script setup>
    import { computed, inject } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import { useCheck } from '@/features/check/model/useCheck';

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    const check = await useCheck({ calculationClient });
    const {
        difficulty,
        scoreParams,
        score,
        scoreSummary,
        resultReady,
        displayRequest,
        presentation,
        rangeFeedback,
        displayFeedback,
        onDifficultyValidated,
        onScoreValidated,
        onDisplayValidated,
    } = check;
    const checkData = computed(() => ({
        dfclty: difficulty.value,
        params: scoreParams.value,
        score: score.value,
        scoreSummary: scoreSummary.value,
        resultReady: resultReady.value,
        rangeFeedback: rangeFeedback.value,
    }));

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :checkData="checkData"
            @dfclty-validated="onDifficultyValidated"
            @score-validated="onScoreValidated"
        /></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel
            :checkData="checkData"
            :displayRequest="displayRequest"
            :presentation="presentation"
            :displayFeedback="displayFeedback"
            @display-validated="onDisplayValidated"
        /></v-col></v-row>
        <v-row v-if="checkData.resultReady"><v-col cols="12"><SummaryPanel :checkData="checkData"/></v-col></v-row>
    </v-container>
</template>
