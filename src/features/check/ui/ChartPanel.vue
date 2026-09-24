<script setup lang="ts">

    import ScoreChart from './ScoreChart.vue';
    import SettingForm from './SettingForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiChartLine } from '@mdi/js';
    import type { DifficultyInput, DisplayRequestSnapshot } from '@/domain/CalculationInputs'
    import type { CheckPresentation } from '../model/CheckPresentationTypes'
    import type { CalculationFeedbackState } from '@/runtime/CalculationFeedbackTypes'
    import type { DisplayFeedbackPlan } from '@/shared/presentation/DistributionProjectionTypes'

    const props = defineProps<{
        difficulty: DifficultyInput
        displayRequest: DisplayRequestSnapshot
        presentation: CheckPresentation | null
        displayFeedback: CalculationFeedbackState<DisplayFeedbackPlan> | null
        preservePreviousFrame: boolean
    }>()
    const emit = defineEmits<{
        'display-validated': [request: DisplayRequestSnapshot]
    }>()

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> 達成値分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <RangePlanNotice :feedback="props.displayFeedback" />
                <ScoreChart
                    :difficulty="props.difficulty"
                    :presentation="props.presentation"
                    :preserve-previous-frame="props.preservePreviousFrame"
                />
                <SettingForm
                    :displayRequest="props.displayRequest"
                    @validated="(request) => emit('display-validated', request)"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
