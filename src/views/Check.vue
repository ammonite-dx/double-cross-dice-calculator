<script setup>

    import { reactive, ref } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        runInitialCalculation,
    } from '@/application/CalculationFeedback';
    import InputPanel from '@/components/Check/InputPanel.vue';
    import ChartPanel from '@/components/Check/ChartPanel.vue';
    import SummaryPanel from '@/components/Check/SummaryPanel.vue';

    const initialDfclty = {opposed:false, target:0}
    const initialParams = {
        action: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
        reaction: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
    };
    const rangeFeedback = createCalculationFeedbackState();
    const initialCalculation = await runInitialCalculation({
        feedback: rangeFeedback,
        calculate: (options) => calculationClient.calculateCheck(
            initialParams,
            initialDfclty,
            options
        ),
        onError: (error) => {
            console.error('Failed to initialize check calculation', error);
        },
    });
    const checkData = ref({
        dfclty: initialDfclty,
        params: initialParams,
        score: initialCalculation?.score ?? null,
        scoreSummary: initialCalculation?.scoreSummary ?? null,
        resultReady: initialCalculation !== null,
        rangeFeedback: reactive(rangeFeedback),
    });

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :checkData="checkData"/></v-col></v-row>
        <v-row v-if="checkData.resultReady"><v-col cols="12"><ChartPanel :checkData="checkData"/></v-col></v-row>
        <v-row v-if="checkData.resultReady"><v-col cols="12"><SummaryPanel :checkData="checkData"/></v-col></v-row>
    </v-container>
</template>
