<script setup>

    import { onUnmounted,watch } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import DfcltyForm from './DfcltyForm.vue';
    import ScoreForm from './ScoreForm.vue';

    const props = defineProps(['checkData']);

    let calculationRevision = 0;
    onUnmounted(() => {
        calculationRevision += 1;
    });
    const updateCheck = async () => {
        const revision = ++calculationRevision;

        try {
            const result = await calculationClient.calculateCheck(props.checkData.params,props.checkData.dfclty);
            if (revision !== calculationRevision) {
                return;
            }
            props.checkData.score = result.score;
            props.checkData.scoreSummary = result.scoreSummary;
        } catch (error) {
            console.error('Failed to update check', error);
        }
    };
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
