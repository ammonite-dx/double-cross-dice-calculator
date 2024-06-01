<script setup>

    import { reactive } from 'vue';
    import { getFinalEncroachment } from '@/data/Calculator';
    import InputPanel from '@/components/Backtrack/InputPanel.vue'
    import FinalEncroachmentChartPanel from '@/components/Backtrack/FinalEncroachmentChartPanel.vue';

    const initialParams = {
        encroachment: 100,
        lois: 7,
        elois: 0,
        dice: 0,
        value: 0,
        dlois: 'なし',
    };
    const initialFinalEncroachment = getFinalEncroachment(initialParams);
    const backtrackData = reactive({
        params: initialParams,
        finalEncroachment: initialFinalEncroachment,
    });

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :backtrackData="backtrackData"/></v-col></v-row>
        <v-row><v-col cols="12"><FinalEncroachmentChartPanel :backtrackData="backtrackData"/></v-col></v-row>
    </v-container>
</template>