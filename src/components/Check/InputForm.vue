<script setup>

    import { watch } from 'vue';
    import { getScore,getScoreSummary } from '@/data/Calculator';
    import DfcltyForm from './DfcltyForm.vue';
    import ScoreForm from './ScoreForm.vue';

    const props = defineProps(['checkData']);

    watch(props.checkData.dfclty, () => {
        props.checkData.scoreSummary = getScoreSummary(props.checkData.score,props.checkData.dfclty);
    });
    watch(props.checkData.params.action, () => {
        props.checkData.score.action = getScore(props.checkData.params.action)
        props.checkData.scoreSummary = getScoreSummary(props.checkData.score,props.checkData.dfclty);
    });
    watch(props.checkData.params.reaction, () => {
        props.checkData.score.reaction = getScore(props.checkData.params.reaction)
        props.checkData.scoreSummary = getScoreSummary(props.checkData.score,props.checkData.dfclty);
    });

</script>

<template>
    <v-container class="pa-4">
        <DfcltyForm :dfclty="checkData.dfclty"/>
        <ScoreForm :side="'action'" :params="checkData.params.action"/>
        <ScoreForm v-if="checkData.dfclty.opposed" :side="'reaction'" :params="checkData.params.reaction"/>
    </v-container>
</template>