<script setup>

    import { watch } from 'vue';
    import { getScore,getScoreSummary } from '@/data/Calculator';
    import { getChartColor } from '@/data/ColorSetter';
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
        <v-container class="pa-0">
            <DfcltyForm :dfclty="checkData.dfclty"/>
        </v-container>
        <v-container class="pa-0">
            <v-row v-if="checkData.dfclty.opposed" class="ma-0 pa-1" :style="{backgroundColor:getChartColor(0)}" style="color:white">アクション側</v-row>
            <ScoreForm :params="checkData.params.action"/>
        </v-container>
        <v-container v-if="checkData.dfclty.opposed" class="pa-0">
            <v-row class="ma-0 pa-1" :style="{backgroundColor:getChartColor(1)}" style="color:white">リアクション側</v-row>
            <ScoreForm :params="checkData.params.reaction"/>
        </v-container>
    </v-container>
</template>