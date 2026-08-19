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
    import { createCheckInputSnapshot } from '@/application/CheckInputSnapshot';
    import InputPanel from '@/components/Check/InputPanel.vue';
    import ChartPanel from '@/components/Check/ChartPanel.vue';
    import SummaryPanel from '@/components/Check/SummaryPanel.vue';

    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    const initialSnapshot = createCheckInputSnapshot({
        difficulty: {opposed:false, target:0},
        params: {
            action: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
            reaction: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
        },
    });
    const rangeFeedback = reactive(createCalculationFeedbackState());
    const initialCalculation = await runInitialCalculation({
        feedback: rangeFeedback,
        calculate: (options) => calculationClient.calculateCheckCanonical(
            initialSnapshot.params,
            initialSnapshot.difficulty,
            options
        ),
        onError: (error) => {
            console.error('Failed to initialize check calculation', error);
        },
    });
    const checkData = reactive({
        dfclty: {...initialSnapshot.difficulty},
        params: {
            action: {...initialSnapshot.params.action},
            reaction: {...initialSnapshot.params.reaction},
        },
        score: initialCalculation?.score ?? null,
        scoreSummary: initialCalculation?.scoreSummary ?? null,
        resultReady: initialCalculation !== null,
        rangeFeedback,
    });
    const calculationRunner = createLatestCalculationRunner({
        feedback: rangeFeedback,
        snapshotRequest: createCheckInputSnapshot,
        calculate: (snapshot) => calculationClient.calculateCheckCanonical(
            snapshot.params,
            snapshot.difficulty,
            snapshot
        ),
        clearResult: () => {
            checkData.score = null;
            checkData.scoreSummary = null;
            checkData.resultReady = false;
        },
        commitResult: (result) => {
            checkData.score = result.score;
            checkData.scoreSummary = result.scoreSummary;
            checkData.resultReady = true;
        },
        onError: (error) => {
            console.error('Failed to update check', error);
        },
    });

    const submitCheck = () => calculationRunner.run(
        createCheckInputSnapshot({
            difficulty: checkData.dfclty,
            params: checkData.params,
        })
    );
    const onDfcltyValidated = (dfclty) => {
        checkData.dfclty = {...dfclty};
        void submitCheck();
    };
    const onScoreValidated = ({side, params}) => {
        if (side !== 'action' && side !== 'reaction') {
            return;
        }
        checkData.params[side] = {...params};
        void submitCheck();
    };

    onMounted(() => {
        if (!checkData.resultReady && rangeFeedback.status !== 'rejected') {
            void calculationRunner.run(initialSnapshot);
        }
    });
    onUnmounted(() => calculationRunner.dispose());

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel
            :checkData="checkData"
            @dfclty-validated="onDfcltyValidated"
            @score-validated="onScoreValidated"
        /></v-col></v-row>
        <v-row v-if="checkData.resultReady"><v-col cols="12"><ChartPanel :checkData="checkData"/></v-col></v-row>
        <v-row v-if="checkData.resultReady"><v-col cols="12"><SummaryPanel :checkData="checkData"/></v-col></v-row>
    </v-container>
</template>
