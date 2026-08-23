<script setup>

    import { inject, onMounted, onUnmounted, reactive } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        runInitialCalculation,
    } from '@/application/CalculationFeedback';
    import { createBacktrackInputSnapshot } from '@/application/BacktrackInputSnapshot';
    import {
        createBacktrackCalculationRunner,
        createBacktrackCalculationSnapshot,
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
        canonicalOptIn: false,
        rangeFeedback,
    });
    const calculationRunner = createBacktrackCalculationRunner({
        state: backtrackData,
        feedback: rangeFeedback,
        calculationClient,
        onError: (error) => {
            console.error('Failed to update backtrack', error);
        },
    });
    const onBacktrackValidated = (params) => {
        const snapshot = createBacktrackCalculationSnapshot({
            params,
            canonicalOptIn: backtrackData.canonicalOptIn,
        });
        backtrackData.params = {...snapshot.params};
        void calculationRunner.run(snapshot);
    };
    const onBacktrackCanonicalToggle = (canonicalOptIn) => {
        const snapshot = createBacktrackCalculationSnapshot({
            params: backtrackData.params,
            canonicalOptIn,
        });
        backtrackData.canonicalOptIn = snapshot.canonicalOptIn;
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
            :canonicalOptIn="backtrackData.canonicalOptIn"
            @validated="onBacktrackValidated"
            @canonical-toggle="onBacktrackCanonicalToggle"
        /></v-col></v-row>
        <v-row v-if="backtrackData.resultReady"><v-col cols="12"><FinalEncroachmentChartPanel :backtrackData="backtrackData"/></v-col></v-row>
    </v-container>
</template>
