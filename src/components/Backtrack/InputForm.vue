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
    import BacktrackForm from './BacktrackForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';

    const props = defineProps(['backtrackData']);
    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    if (!props.backtrackData.rangeFeedback) {
        props.backtrackData.rangeFeedback = createCalculationFeedbackState();
    }
    const calculationRunner = createLatestCalculationRunner({
        feedback: props.backtrackData.rangeFeedback,
        calculate: (options) => calculationClient.calculateBacktrack(
            props.backtrackData.params,
            options
        ),
        clearResult: () => {
            props.backtrackData.finalEncroachment = null;
            props.backtrackData.resultReady = false;
        },
        commitResult: (result) => {
            props.backtrackData.finalEncroachment = result;
            props.backtrackData.resultReady = true;
        },
        onError: (error) => {
            console.error('Failed to update backtrack', error);
        },
    });
    const updateBacktrack = () => calculationRunner.run();
    onMounted(() => {
        if (!props.backtrackData.resultReady
            && props.backtrackData.rangeFeedback.status !== 'rejected') {
            void updateBacktrack();
        }
    });
    onUnmounted(() => calculationRunner.invalidate());
    watch(props.backtrackData.params, () => {
        void updateBacktrack();
    });

</script>

<template>
    <v-container class="pa-4">
        <RangePlanNotice :feedback="backtrackData.rangeFeedback" />
        <v-container class="pa-0">
            <BacktrackForm :params="backtrackData.params"/>
        </v-container>
    </v-container>
</template>
