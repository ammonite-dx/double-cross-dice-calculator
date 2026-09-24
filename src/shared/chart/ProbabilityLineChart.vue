<script setup lang="ts">

    import { computed, shallowRef, watch } from 'vue'
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

    interface ProbabilityChartFrame {
        readonly data: ChartData<'line'>
        readonly options: ChartOptions<'line'>
    }

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
        preservePreviousFrame?: boolean
        datasetIdKey?: string
    }>(), {
        data: null,
        accessibleName: '確率分布チャート',
        preservePreviousFrame: false,
        datasetIdKey: 'label',
    })

    const { mdAndUp } = useDisplay()
    const style = computed(() => getProbabilityLineChartStyle(mdAndUp.value))
    // This is a short-lived rendering cache, not calculation state: stale
    // data remains visible only while a replacement request is loading.
    const frame = shallowRef<ProbabilityChartFrame | null>(null)

    watch(
        () => [props.data, props.options, props.preservePreviousFrame] as const,
        ([data, options, preservePreviousFrame]) => {
            if (data !== null && data !== undefined) {
                frame.value = {
                    data: data as unknown as ChartData<'line'>,
                    options: options as unknown as ChartOptions<'line'>,
                }
            } else if (!preservePreviousFrame) {
                frame.value = null
            }
        },
        { immediate: true },
    )

</script>

<template>
    <div>
        <Line v-if="frame !== null" :data="frame.data" :options="frame.options" :dataset-id-key="props.datasetIdKey" :style="style" :aria-label="props.accessibleName" />
    </div>
</template>
