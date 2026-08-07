<script setup>

    import { reactive } from 'vue';
    import { calculationClient } from '@/application/CalculationClient';
    import InputPanel from '@/components/Attack/InputPanel.vue';
    import ScoreChartPanel from '@/components/Attack/ScoreChartPanel.vue';
    import DamageChartPanel from '@/components/Attack/DamageChartPanel.vue';
    import SummaryPanel from '@/components/Attack/SummaryPanel.vue';

    const initialParams = {
        action: {
            score: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
            damage: {dice:0, value:0, kazanari:0},
        },
        reaction: {
            mode: 'ドッジ',
            score: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
            damage: {dice:0, value:0},
        }
    };
    const initialCalculation = await calculationClient.calculateAttackCombo(initialParams);
    const attackData = reactive({
        combos: [{
            id: 0,
            name: 'コンボ1',
            show: true,
            showDetails: {
                action: {value:false},
                reaction: {value:false}
            },
            data: {
                params: initialParams,
                score: initialCalculation.score,
                scoreSummary: initialCalculation.scoreSummary,
                damage: initialCalculation.damage,
                damageSummary: initialCalculation.damageSummary,
            },
        }],
        totalDamage: initialCalculation.damage,
        totalDamageSummary: initialCalculation.damageSummary,
    });

</script>

<template>
    <v-container class="pa-6" fluid>
        <v-row><v-col cols="12"><InputPanel :attackData="attackData"/></v-col></v-row>
        <v-row>
            <v-col md="6" cols="12"><ScoreChartPanel :attackData="attackData"/></v-col>
            <v-col md="6" cols="12"><DamageChartPanel :attackData="attackData"/></v-col>
        </v-row>
        <v-row><v-col cols="12"><SummaryPanel :attackData="attackData"/></v-col></v-row>
    </v-container>
</template>
