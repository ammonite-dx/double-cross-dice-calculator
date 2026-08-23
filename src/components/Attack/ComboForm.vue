<script setup>

    import { inject, onMounted, onUnmounted } from 'vue';
    import {
        CALCULATION_CLIENT_KEY,
        calculationClient as defaultCalculationClient,
    } from '@/application/CalculationClient';
    import {
        createCalculationFeedbackState,
        createLatestCalculationRunner,
    } from '@/application/CalculationFeedback';
    import {
        replaceAttackSideSnapshot,
    } from '@/application/AttackInputSnapshot';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
    const emit = defineEmits(['show-details']);
    const calculationClient = inject(
        CALCULATION_CLIENT_KEY,
        defaultCalculationClient
    );
    if (!props.comboData.rangeFeedback) {
        props.comboData.rangeFeedback = createCalculationFeedbackState();
    }
    let disposed = false;
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
    const updateCombo = () => disposed
        ? Promise.resolve(false)
        : calculationRunner.run();
    const onSideValidated = (side, snapshot) => {
        if (disposed) {
            return;
        }
        replaceAttackSideSnapshot(props.comboData.params, side, snapshot);
        void updateCombo();
    };
    const onShowDetails = (side, value) => {
        if (disposed) {
            return;
        }
        emit('show-details', {side, value});
    };
    onMounted(() => {
        if (!props.comboData.resultReady
            && props.comboData.rangeFeedback.status !== 'rejected') {
            void updateCombo();
        }
    });
    onUnmounted(() => {
        disposed = true;
        calculationRunner.dispose();
    });

</script>

<template>
    <AttackForm
        :params="comboData.params.action"
        :comboColor="comboColor"
        :showDetails="showDetails.action"
        @validated="(snapshot) => onSideValidated('action', snapshot)"
        @show-details="(value) => onShowDetails('action', value)"
    />
    <DefenceForm
        :params="comboData.params.reaction"
        :comboColor="comboColor"
        :showDetails="showDetails.reaction"
        @validated="(snapshot) => onSideValidated('reaction', snapshot)"
        @show-details="(value) => onShowDetails('reaction', value)"
    />
</template>
