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
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    if (!props.comboData.rangeFeedback) {
        props.comboData.rangeFeedback = createCalculationFeedbackState();
    }
    const calculationRunner = createLatestCalculationRunner({
        feedback: props.comboData.rangeFeedback,
        calculate: (options) => calculationClient.calculateAttackCombo(
            props.comboData.params,
            options
        ),
        clearResult: () => {
            props.comboData.score = null;
            props.comboData.scoreSummary = null;
            props.comboData.damage = null;
            props.comboData.damageSummary = null;
            props.comboData.resultReady = false;
        },
        commitResult: (result) => {
            props.comboData.score = result.score;
            props.comboData.scoreSummary = result.scoreSummary;
            props.comboData.damage = result.damage;
            props.comboData.damageSummary = result.damageSummary;
            props.comboData.resultReady = true;
        },
        onError: (error) => {
            console.error('Failed to update combo', error);
        },
    });
    const updateCombo = () => calculationRunner.run();
    onMounted(() => {
        if (!props.comboData.resultReady
            && props.comboData.rangeFeedback.status !== 'rejected') {
            void updateCombo();
        }
    });
    onUnmounted(() => calculationRunner.invalidate());
    watch(props.comboData.params.action.score, () => {
        void updateCombo();
    });
    watch(props.comboData.params.reaction.score, () => {
        void updateCombo();
    });
    watch(() => props.comboData.params.reaction.mode, () => {
        void updateCombo();
    });
    watch(props.comboData.params.action.damage, () => {
        void updateCombo();
    });
    watch(props.comboData.params.reaction.damage, () => {
        void updateCombo();
    });

</script>

<template>
    <AttackForm :params="comboData.params.action" :comboColor="comboColor" :showDetails="showDetails.action"/>
    <DefenceForm :params="comboData.params.reaction" :comboColor="comboColor" :showDetails="showDetails.reaction"/>
</template>
