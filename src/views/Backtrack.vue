<script setup>

    import { inject, onMounted, onUnmounted, reactive } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        createLatestCalculationRunner,
        runInitialCalculation,
    } from '@/application/CalculationFeedback';
    import { createBacktrackInputSnapshot } from '@/application/BacktrackInputSnapshot';
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
    const initialFinalEncroachment = await runInitialCalculation({
        feedback: rangeFeedback,
        calculate: (options) => calculationClient.calculateBacktrack(
            initialSnapshot.params,
            options
        ),
        onError: (error) => {
            console.error('Failed to initialize backtrack calculation', error);
        },
    });
    const backtrackData = reactive({
        params: {...initialSnapshot.params},
        finalEncroachment: initialFinalEncroachment,
        resultReady: initialFinalEncroachment !== null,
        rangeFeedback,
    });
    const calculationRunner = createLatestCalculationRunner({
        feedback: rangeFeedback,
        snapshotRequest: createBacktrackInputSnapshot,
        calculate: (snapshot) => calculationClient.calculateBacktrack(
            snapshot.params,
            snapshot
        ),
        clearResult: () => {
            backtrackData.finalEncroachment = null;
            backtrackData.resultReady = false;
        },
        commitResult: (result) => {
            backtrackData.finalEncroachment = result;
            backtrackData.resultReady = true;
        },
        onError: (error) => {
            console.error('Failed to update backtrack', error);
        },
    });
    const onBacktrackValidated = (params) => {
        const snapshot = createBacktrackInputSnapshot({ params });
        backtrackData.params = {...snapshot.params};
        void calculationRunner.run(snapshot);
    };

    onMounted(() => {
        if (!backtrackData.resultReady && rangeFeedback.status !== 'rejected') {
            void calculationRunner.run(initialSnapshot);
        }
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
