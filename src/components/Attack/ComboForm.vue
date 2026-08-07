<script setup>

    import { onMounted,onUnmounted,watch } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
    let calculationRevision = 0;
    onUnmounted(() => {
        calculationRevision += 1;
    });
    const updateCombo = async () => {
        const revision = ++calculationRevision;

        try {
            const result = await calculationClient.calculateAttackCombo(props.comboData.params);
            if (revision !== calculationRevision) {
                return;
            }
            props.comboData.score = result.score;
            props.comboData.scoreSummary = result.scoreSummary;
            props.comboData.damage = result.damage;
            props.comboData.damageSummary = result.damageSummary;
        } catch (error) {
            console.error('Failed to update combo', error);
        }
    };
    onMounted(() => {
        void updateCombo();
    });
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
