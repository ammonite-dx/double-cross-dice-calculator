<script setup>

    import InputForm from './InputForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiTuneVariant } from '@mdi/js'

    const props = defineProps({
        backtrackData: {
            type: Object,
            required: true,
        },
    });
    const emit = defineEmits(['validated']);
    const onValidated = (params) => {
        emit('validated', params);
    };

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiTuneVariant"/> バックトラック条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <v-container class="pa-4">
                <RangePlanNotice :feedback="props.backtrackData.rangeFeedback" />
                <InputForm :backtrackData="props.backtrackData" @validated="onValidated"/>
            </v-container>
        </v-card-text>
    </v-card>
</template>
