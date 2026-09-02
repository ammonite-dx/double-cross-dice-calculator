<script setup>

    import DfcltyForm from './DfcltyForm.vue';
    import ScoreForm from './ScoreForm.vue';

    const props = defineProps({
        difficulty: {
            type: Object,
            required: true,
        },
        scoreParams: {
            type: Object,
            required: true,
        },
    });
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
        <DfcltyForm :dfclty="props.difficulty" @validated="onDfcltyValidated"/>
        <ScoreForm :side="'action'" :params="props.scoreParams.action" @validated="(params) => onScoreValidated('action', params)"/>
        <ScoreForm v-if="props.difficulty.opposed" :side="'reaction'" :params="props.scoreParams.reaction" @validated="(params) => onScoreValidated('reaction', params)"/>
    </v-container>
</template>
