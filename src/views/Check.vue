<script setup>

    import { ref } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import InputPanel from '@/components/Check/InputPanel.vue';
    import ChartPanel from '@/components/Check/ChartPanel.vue';
    import SummaryPanel from '@/components/Check/SummaryPanel.vue';

    const initialDfclty = {opposed:false, target:0}
    const initialParams = {
        action: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
        reaction: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
    };
    const initialCalculation = await calculationClient.calculateCheck(initialParams,initialDfclty);
    const checkData = ref({
        dfclty: initialDfclty,
        params: initialParams,
        score: initialCalculation.score,
        scoreSummary: initialCalculation.scoreSummary,
    });

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :checkData="checkData"/></v-col></v-row>
        <v-row><v-col cols="12"><ChartPanel :checkData="checkData"/></v-col></v-row>
        <v-row><v-col cols="12"><SummaryPanel :checkData="checkData"/></v-col></v-row>
    </v-container>
</template>
