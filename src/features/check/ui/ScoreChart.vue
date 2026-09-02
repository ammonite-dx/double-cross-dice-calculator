<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify';
    import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
    import { Line } from 'vue-chartjs';
    import annotationPlugin from 'chartjs-plugin-annotation';
    import { getCheckChartOptions, getCheckChartStyle } from './ChartSetter';

    Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

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
    const { mdAndUp } = useDisplay();
    const data = computed(() => props.presentation?.status === 'ready'
        ? props.presentation.chart
        : null);
    const options = computed(() => getCheckChartOptions(props.difficulty));
    const style = computed(() => getCheckChartStyle(mdAndUp.value));

</script>

<template>
    <div>
        <Line v-if="data !== null" :data="data" :options="options" :style="style"/>
    </div>
</template>
