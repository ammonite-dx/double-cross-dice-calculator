<script setup>

    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import {
        getCanonicalAttackDamageChartData,
        getAttackDamageChartOptions,
    } from './ChartSetter';

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
    });
    const data = computed(() => getCanonicalAttackDamageChartData(
        props.presentation,
        props.attackData
    ));
    const options = computed(() => getAttackDamageChartOptions(props.attackData.dfclty));

</script>

<template>
    <ProbabilityLineChart :data="data" :options="options" />
</template>
