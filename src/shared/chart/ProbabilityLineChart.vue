<script setup lang="ts">

    import { computed } from 'vue'
    import { useDisplay } from 'vuetify'
    import {
        CategoryScale,
        Chart,
        Legend,
        LinearScale,
        LineElement,
        PointElement,
        Title,
        Tooltip,
    } from 'chart.js'
    import annotationPlugin from 'chartjs-plugin-annotation'
    import { Line } from 'vue-chartjs'
    import { getProbabilityLineChartStyle } from './ProbabilityLineChartConfig'
    import type { ChartData, ChartOptions } from 'chart.js'
    import type { ProbabilityLineChartOptions } from './ProbabilityLineChartConfig'
    import type { ChartJsData } from '@/types/ChartJsDataTypes'

    type ProbabilityChartData = ChartData<'line', ArrayLike<number>, number> | ChartJsData

    Chart.register(
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        Title,
        Tooltip,
        Legend,
        annotationPlugin,
    )

    const props = withDefaults(defineProps<{
        data?: ProbabilityChartData | null
        options: ProbabilityLineChartOptions
        accessibleName?: string
    }>(), {
        data: null,
        accessibleName: '確率分布チャート',
    })

    const { mdAndUp } = useDisplay()
    const style = computed(() => getProbabilityLineChartStyle(mdAndUp.value))
    const chartData = computed(() => props.data === null
        ? null
        : props.data as unknown as ChartData<'line'>)
    const chartOptions = computed(() =>
        props.options as unknown as ChartOptions<'line'>)

</script>

<template>
    <div>
        <Line v-if="chartData !== null" :data="chartData" :options="chartOptions" :style="style" :aria-label="props.accessibleName" />
    </div>
</template>
