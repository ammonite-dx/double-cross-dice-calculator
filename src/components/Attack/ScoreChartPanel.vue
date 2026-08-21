<script setup>

    import ScoreChart from './ScoreChart.vue';
    import ScoreSettingForm from './ScoreSettingForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiChartLine } from '@mdi/js';

    const props = defineProps({
        attackData: {
            type: Object,
            required: true,
        },
        displayRequest: {
            type: Object,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
        canonicalOptIn: {
            type: Boolean,
            default: false,
        },
        displayFeedback: {
            type: Object,
            default: null,
        },
    });
    const emit = defineEmits(['display-validated']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> 達成値分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <RangePlanNotice :feedback="props.displayFeedback" />
                <ScoreChart
                    :attackData="props.attackData"
                    :displayRequest="props.displayRequest"
                    :presentation="props.presentation"
                    :canonicalOptIn="props.canonicalOptIn"
                />
                <ScoreSettingForm
                    :displayRequest="props.displayRequest"
                    :canonicalOptIn="props.canonicalOptIn"
                    @validated="(request) => emit('display-validated', request)"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
