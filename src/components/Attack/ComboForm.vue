<script setup>

    import { watch } from 'vue';
    import { getScore,getScoreSummary,getDamage,getDamageSummary } from '@/data/Calculator';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
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
    <AttackForm :params="comboData.params.action" :comboColor="comboColor" :showDetails="showDetails.action"/>
    <DefenceForm :params="comboData.params.reaction" :comboColor="comboColor" :showDetails="showDetails.reaction"/>
</template>