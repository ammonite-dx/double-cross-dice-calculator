<script setup>

    import { watch } from 'vue';
    import { getScore,getScoreSummary,getDamage,getDamageSummary } from '@/data/Calculator';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor']);
    watch(props.comboData.params.action.score, () => {
        props.comboData.score.action = getScore(props.comboData.params.action.score);
        props.comboData.scoreSummary = getScoreSummary(props.comboData.score);
        props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
        props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
    });
    watch(props.comboData.params.reaction.score, () => {
        props.comboData.score.reaction = getScore(props.comboData.params.reaction.score,props.comboData.params.reaction.mode=='《イベイジョン》');
        props.comboData.scoreSummary = getScoreSummary(props.comboData.score);
        props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
        props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
    });
    watch(props.comboData.params.action.damage, () => {
        props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
        props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
    });
    watch(props.comboData.params.reaction.damage, () => {
        props.comboData.damage = getDamage(props.comboData.score, props.comboData.params.action.damage, props.comboData.params.reaction.damage);
        props.comboData.damageSummary = getDamageSummary(props.comboData.damage);
    });

</script>

<template>
    <v-container class="px-0 pt-2 pb-0">
        <v-row class="ma-0 pa-1" :style="{backgroundColor:comboColor}" style="color:white">攻撃側</v-row>
        <AttackForm :params="comboData.params.action"/>
    </v-container>
    <v-container class="px-0 pt-2 pb-0">
        <v-row class="ma-0 pa-1" :style="{backgroundColor:comboColor}"  style="color:white">防御側</v-row>
        <DefenceForm :params="comboData.params.reaction"/>
    </v-container>
</template>