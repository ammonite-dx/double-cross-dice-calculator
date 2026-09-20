<script setup lang="ts">

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { Chart,ArcElement,Tooltip,Title,Legend } from 'chart.js';
    import { Doughnut } from 'vue-chartjs';
    import ChartDataLabels from 'chartjs-plugin-datalabels';
    import type { BacktrackChartPresentation } from '../model/BacktrackPresentation'
    import { getBacktrackChartData,getBacktrackChartOptions,getBacktrackChartStyle } from './BacktrackChartAdapter';

    Chart.register(ArcElement,Tooltip,Title,Legend,ChartDataLabels);

    const props = defineProps<{ chart: BacktrackChartPresentation }>();
    const { mdAndUp,smAndUp } = useDisplay()
    const data = computed(() => getBacktrackChartData(props.chart));
    const options = computed(() => getBacktrackChartOptions(props.chart,smAndUp.value));
    const style = computed(() => getBacktrackChartStyle(mdAndUp.value))

</script>

<template>
    <div class="ma-0">
        <Doughnut :data="data" :options="options" :style="style" :aria-label="props.chart.accessibleName" />
    </div>
</template>
