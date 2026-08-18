<script setup>

    import DfcltyForm from './DfcltyForm.vue';
    import ScoreForm from './ScoreForm.vue';

    defineProps(['checkData']);
    const emit = defineEmits(['dfclty-validated', 'score-validated']);
    const onDfcltyValidated = (dfclty) => {
        emit('dfclty-validated', dfclty);
    };
    const onScoreValidated = (side, params) => {
        emit('score-validated', {side, params});
    };

</script>

<template>
    <v-container class="pa-4">
        <DfcltyForm :dfclty="checkData.dfclty" @validated="onDfcltyValidated"/>
        <ScoreForm :side="'action'" :params="checkData.params.action" @validated="(params) => onScoreValidated('action', params)"/>
        <ScoreForm v-if="checkData.dfclty.opposed" :side="'reaction'" :params="checkData.params.reaction" @validated="(params) => onScoreValidated('reaction', params)"/>
    </v-container>
</template>
