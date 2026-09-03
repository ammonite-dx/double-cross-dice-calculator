<script setup>

    import DamageChart from './DamageChart.vue';
    import DamageSettingForm from './DamageSettingForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiChartLine } from '@mdi/js'

    const props = defineProps({
        combos: {
            type: Array,
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
        displayFeedback: {
            type: Object,
            default: null,
        },
    });
    const emit = defineEmits(['display-validated']);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> ダメージ分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <RangePlanNotice :feedback="props.displayFeedback" />
                <DamageChart
                    :combos="props.combos"
                    :presentation="props.presentation"
                />
                <DamageSettingForm
                    :displayRequest="props.displayRequest"
                    @validated="(request) => emit('display-validated', request)"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
