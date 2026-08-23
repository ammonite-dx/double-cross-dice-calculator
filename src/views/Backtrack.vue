<script setup>

    import { inject, onMounted, onUnmounted, reactive } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import { createCalculationFeedbackState } from '@/application/CalculationFeedback';
    import { createBacktrackInputSnapshot } from '@/application/BacktrackInputSnapshot';
    import {
        createBacktrackCanonicalRunner,
    } from '@/application/BacktrackCalculationRunner';
    import InputPanel from '@/components/Backtrack/InputPanel.vue'
    import FinalEncroachmentChartPanel from '@/components/Backtrack/FinalEncroachmentChartPanel.vue';

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    const initialSnapshot = createBacktrackInputSnapshot({
        params: {
            encroachment: 100,
            lois: 7,
            elois: 0,
            dice: 0,
            value: 0,
            dlois: 'なし',
        },
    });
    const rangeFeedback = reactive(createCalculationFeedbackState());
    const backtrackData = reactive({
        params: {...initialSnapshot.params},
        finalEncroachment: null,
        resultReady: false,
        rangeFeedback,
    });
    const calculationRunner = createBacktrackCanonicalRunner({
        state: backtrackData,
        feedback: rangeFeedback,
        calculationClient,
        onError: (error) => {
            console.error('Failed to update backtrack', error);
        },
    });
    const onBacktrackValidated = (params) => {
        const snapshot = createBacktrackInputSnapshot({params});
        backtrackData.params = {...snapshot.params};
        void calculationRunner.run(snapshot);
    };

    onMounted(() => {
        void calculationRunner.run(initialSnapshot);
    });
    onUnmounted(() => calculationRunner.dispose());

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :backtrackData="backtrackData"
            @validated="onBacktrackValidated"
        /></v-col></v-row>
        <v-row v-if="backtrackData.resultReady"><v-col cols="12"><FinalEncroachmentChartPanel :backtrackData="backtrackData"/></v-col></v-row>
    </v-container>
</template>
