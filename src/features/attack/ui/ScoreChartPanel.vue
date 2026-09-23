<script setup lang="ts">

    import ScoreChart from './ScoreChart.vue';
    import ScoreSettingForm from './ScoreSettingForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiChartLine } from '@mdi/js';
    import type { AttackUiCombo } from '../model/AttackControllerTypes'
    import type {
        AttackDisplayPresentation,
        AttackScoreDisplayPresentation,
    } from '../model/AttackPresentationTypes'
    import type { DisplayRequestSnapshot } from '@/domain/CalculationInputs'
    import type { CalculationFeedbackState } from '@/runtime/CalculationFeedbackTypes'
    import type { DisplayFeedbackPlan } from '@/shared/presentation/DistributionProjectionTypes'

    const props = defineProps<{
        combos: readonly AttackUiCombo[]
        displayRequest: DisplayRequestSnapshot
        presentation: AttackDisplayPresentation | AttackScoreDisplayPresentation | null
        displayFeedback: CalculationFeedbackState<DisplayFeedbackPlan> | null
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
                    :combos="props.combos"
                    :presentation="props.presentation"
                />
                <ScoreSettingForm
                    :displayRequest="props.displayRequest"
                    @validated="(request) => emit('display-validated', request)"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
