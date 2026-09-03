<script setup>

    import { computed } from 'vue';
    import ProbabilityLineChart from '@/shared/chart/ProbabilityLineChart.vue';
    import { getCheckChartOptions } from './ChartSetter';

    const props = defineProps({
        difficulty: {
            type: Object,
            required: true,
        },
        presentation: {
            type: Object,
            default: null,
        },
    });
    const data = computed(() => props.presentation?.status === 'ready'
        ? props.presentation.chart
        : null);
    const options = computed(() => getCheckChartOptions(props.difficulty));

</script>

<template>
    <ProbabilityLineChart :data="data" :options="options" />
</template>
