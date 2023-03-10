<script setup>

    import { ref } from 'vue';
    import { getScore, getScoreSummary } from '@/data/Calculator';
    import InputPanel from '@/components/Check/InputPanel.vue';
    import ChartPanel from '@/components/Check/ChartPanel.vue';
    import SummaryPanel from '@/components/Check/SummaryPanel.vue';

    const initialDfclty = {opposed:false, target:0}
    const initialParams = {
        action: {dice:1, critical:10, skill:0},
        reaction: {dice:1, critical:10, skill:0},
    };
    const initialScore = {
        action: getScore(initialParams.action),
        reaction: getScore(initialParams.reaction),
    };
    const initialScoreSummary = getScoreSummary(initialScore,initialDfclty);
    const checkData = ref({
        dfclty: initialDfclty,
        params: initialParams,
        score: initialScore,
        scoreSummary: initialScoreSummary,
    });

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :checkData="checkData"/></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel :checkData="checkData"/></v-col></v-row>
        <v-row><v-col cols="12"><SummaryPanel :checkData="checkData"/></v-col></v-row>
    </v-container>
</template>