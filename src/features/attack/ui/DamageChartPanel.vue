<script setup lang="ts">

    import DamageChart from './DamageChart.vue';
    import DamageSettingForm from './DamageSettingForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiChartLine } from '@mdi/js'
    import type { AttackUiCombo } from '../model/AttackControllerTypes'
    import type { AttackDisplayPresentation } from '../model/AttackPresentationTypes'
    import type { DisplayRequestSnapshot } from '@/domain/CalculationInputs'
    import type { CalculationFeedbackState } from '@/runtime/CalculationFeedbackTypes'
    import type { DisplayFeedbackPlan } from '@/shared/presentation/DistributionProjectionTypes'

    const props = defineProps<{
        combos: readonly AttackUiCombo[]
        displayRequest: DisplayRequestSnapshot
        presentation: AttackDisplayPresentation | null
        displayFeedback: CalculationFeedbackState<DisplayFeedbackPlan> | null
        preservePreviousFrame: boolean
    }>()
    const emit = defineEmits<{
        'display-validated': [request: DisplayRequestSnapshot]
    }>()

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> ダメージ分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <RangePlanNotice :feedback="props.displayFeedback" />
                <DamageChart
                    :combos="props.combos"
                    :presentation="props.presentation"
                    :preserve-previous-frame="props.preservePreviousFrame"
                />
                <DamageSettingForm
                    :displayRequest="props.displayRequest"
                    @validated="(request) => emit('display-validated', request)"
                />
            </v-card-text>
        </v-container>
    </v-card>
</template>
