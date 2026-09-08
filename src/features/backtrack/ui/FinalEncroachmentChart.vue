<script setup>

    import { computed } from 'vue';
    import { useDisplay } from 'vuetify'
    import {
        BarElement,
        CategoryScale,
        Chart,
        Legend,
        LinearScale,
        Title,
        Tooltip,
    } from 'chart.js';
    import { Bar } from 'vue-chartjs';
    import { getFinalEncroachmentChartData,getFinalEncroachmentChartOptions,getFinalEncroachmentChartStyle } from './ChartSetter';

    Chart.register(BarElement,CategoryScale,LinearScale,Tooltip,Title,Legend);

    const props = defineProps(['finalEncroachment','mode']);
    const { mdAndUp,smAndUp } = useDisplay()
    const data = computed(() => getFinalEncroachmentChartData(props.finalEncroachment,props.mode));
    const options = computed(() => getFinalEncroachmentChartOptions(props.mode,smAndUp.value));
    const style = computed(() => getFinalEncroachmentChartStyle(mdAndUp.value))
    const accessibleName = computed(() => {
        const titles = {
            single: '一倍振り',
            undead: '一倍振り（屍人・悪夢）',
            double: '二倍振り',
            second: '二倍振りと追加振り',
        }
        return `最終侵蝕率分布 ${titles[props.mode] ?? ''}`.trim()
    })

</script>

<template>
    <div class="ma-0" role="img" :aria-label="accessibleName">
        <Bar :data="data" :options="options" :style="style" />
    </div>
</template>
