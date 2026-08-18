<script setup>

    import InputForm from './InputForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiTuneVariant } from '@mdi/js'

    const props = defineProps(['checkData']);
    const emit = defineEmits(['dfclty-validated', 'score-validated']);
    const onDfcltyValidated = (dfclty) => {
        emit('dfclty-validated', dfclty);
    };
    const onScoreValidated = (payload) => {
        emit('score-validated', payload);
    };

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiTuneVariant"/> 判定条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <RangePlanNotice :feedback="props.checkData.rangeFeedback" />
            <InputForm
                :checkData="checkData"
                @dfclty-validated="onDfcltyValidated"
                @score-validated="onScoreValidated"
            />
        </v-card-text>
    </v-card>
</template>
