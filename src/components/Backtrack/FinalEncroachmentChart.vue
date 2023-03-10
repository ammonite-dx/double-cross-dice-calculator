<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import { Chart,ArcElement,Tooltip,Title,Legend } from 'chart.js';
    import { Doughnut } from 'vue-chartjs';
    import ChartDataLabels from 'chartjs-plugin-datalabels';
    import { getFinalEncroachmentChartData,getFinalEncroachmentChartOptions,getFinalEncroachmentChartStyle } from './ChartSetter';

    Chart.register(ArcElement,Tooltip,Title,Legend,ChartDataLabels);

    const props = defineProps(['finalEncroachment','mode']);
    const { mdAndUp,smAndUp } = useDisplay()
    const data = computed(() => getFinalEncroachmentChartData(props.finalEncroachment,props.mode));
    const options = computed(() => getFinalEncroachmentChartOptions(props.mode,smAndUp.value));
    const style = computed(() => getFinalEncroachmentChartStyle(mdAndUp.value))

</script>

<template>
    <div class="ma-0">
        <Doughnut :data="data" :options="options" :style="style" />
    </div>
</template>