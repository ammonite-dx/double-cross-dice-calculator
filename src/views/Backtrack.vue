<script setup>

    import { reactive } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        runInitialCalculation,
    } from '@/application/CalculationFeedback';
    import InputPanel from '@/components/Backtrack/InputPanel.vue'
    import FinalEncroachmentChartPanel from '@/components/Backtrack/FinalEncroachmentChartPanel.vue';

    const initialParams = {
        encroachment: 100,
        lois: 7,
        elois: 0,
        dice: 0,
        value: 0,
        dlois: 'なし',
    };
    const rangeFeedback = createCalculationFeedbackState();
    const initialFinalEncroachment = await runInitialCalculation({
        feedback: rangeFeedback,
        calculate: (options) => calculationClient.calculateBacktrack(
            initialParams,
            options
        ),
        onError: (error) => {
            console.error('Failed to initialize backtrack calculation', error);
        },
    });
    const backtrackData = reactive({
        params: initialParams,
        finalEncroachment: initialFinalEncroachment,
        resultReady: initialFinalEncroachment !== null,
        rangeFeedback: reactive(rangeFeedback),
    });

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :backtrackData="backtrackData"/></v-col></v-row>
        <v-row v-if="backtrackData.resultReady"><v-col cols="12"><FinalEncroachmentChartPanel :backtrackData="backtrackData"/></v-col></v-row>
    </v-container>
</template>
