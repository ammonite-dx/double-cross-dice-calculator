<script setup>

    import { inject, onMounted, onUnmounted, watch } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        createLatestCalculationRunner,
    } from '@/application/CalculationFeedback';
    import DfcltyForm from './DfcltyForm.vue';
    import ScoreForm from './ScoreForm.vue';

    const props = defineProps(['checkData']);
    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    if (!props.checkData.rangeFeedback) {
        props.checkData.rangeFeedback = createCalculationFeedbackState();
    }
    const calculationRunner = createLatestCalculationRunner({
        feedback: props.checkData.rangeFeedback,
        calculate: (options) => calculationClient.calculateCheck(
            props.checkData.params,
            props.checkData.dfclty,
            options
        ),
        clearResult: () => {
            props.checkData.score = null;
            props.checkData.scoreSummary = null;
            props.checkData.resultReady = false;
        },
        commitResult: (result) => {
            props.checkData.score = result.score;
            props.checkData.scoreSummary = result.scoreSummary;
            props.checkData.resultReady = true;
        },
        onError: (error) => {
            console.error('Failed to update check', error);
        },
    });
    const updateCheck = () => calculationRunner.run();
    onMounted(() => {
        if (!props.checkData.resultReady
            && props.checkData.rangeFeedback.status !== 'rejected') {
            void updateCheck();
        }
    });
    onUnmounted(() => calculationRunner.invalidate());
    watch(props.checkData.dfclty, () => {
        void updateCheck();
    });
    watch(props.checkData.params.action, () => {
        void updateCheck();
    });
    watch(props.checkData.params.reaction, () => {
        void updateCheck();
    });

</script>

<template>
    <v-container class="pa-4">
        <DfcltyForm :dfclty="checkData.dfclty"/>
        <ScoreForm :side="'action'" :params="checkData.params.action"/>
        <ScoreForm v-if="checkData.dfclty.opposed" :side="'reaction'" :params="checkData.params.reaction"/>
    </v-container>
</template>
