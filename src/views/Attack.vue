<script setup>

    import { reactive } from 'vue';
    import { getScore,getScoreSummary,getDamage,getDamageSummary } from '@/data/Calculator';
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
    const initialScore = {
        action: getScore(initialParams.action.score),
        reaction: getScore(initialParams.reaction.score),
    };
    const initialScoreSummary = getScoreSummary(initialScore);
    const initialDamage = getDamage(initialScore,initialParams.action.damage,initialParams.reaction.damage);
    const initialDamageSummary = getDamageSummary(initialDamage);
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
                score: initialScore,
                scoreSummary: initialScoreSummary,
                damage: initialDamage,
                damageSummary: initialDamageSummary,
            },
        }],
        totalDamage: initialDamage,
        totalDamageSummary: initialDamageSummary,
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