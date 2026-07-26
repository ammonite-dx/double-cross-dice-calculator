<script setup>

    import { watch } from 'vue';
    import { loadDxAsset } from '@/data/PrecomputedDataRepository';
    import { getScore,getScoreSummary } from '@/data/ScoreCalculator';
    import DfcltyForm from './DfcltyForm.vue';
    import ScoreForm from './ScoreForm.vue';

    const props = defineProps(['checkData']);

    watch(props.checkData.dfclty, () => {
        props.checkData.scoreSummary = getScoreSummary(props.checkData.score,props.checkData.dfclty);
    });
    const calculationRevision = {action: 0, reaction: 0};
    const updateScore = async (side) => {
        const revision = ++calculationRevision[side];
        const params = props.checkData.params[side];

        try {
            await loadDxAsset(params.shihai);
            if (revision !== calculationRevision[side]) {
                return;
            }
            props.checkData.score[side] = getScore(params);
            props.checkData.scoreSummary = getScoreSummary(props.checkData.score,props.checkData.dfclty);
        } catch (error) {
            console.error(`Failed to update ${side} score`, error);
        }
    };
    watch(props.checkData.params.action, () => {
        void updateScore('action');
    });
    watch(props.checkData.params.reaction, () => {
        void updateScore('reaction');
    });

</script>

<template>
    <v-container class="pa-4">
        <DfcltyForm :dfclty="checkData.dfclty"/>
        <ScoreForm :side="'action'" :params="checkData.params.action"/>
        <ScoreForm v-if="checkData.dfclty.opposed" :side="'reaction'" :params="checkData.params.reaction"/>
    </v-container>
</template>
