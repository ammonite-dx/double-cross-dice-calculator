<script setup lang="ts">

    import BacktrackForm from './BacktrackForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiTuneVariant } from '@mdi/js'
    import type { BacktrackParams } from '@/domain/BacktrackRules'
    import type { CalculationFeedbackState } from '@/runtime/CalculationFeedbackTypes'
    import type { DraftValidation } from '@/shared/validation/DraftValidation'

    const props = defineProps<{
        params: Partial<BacktrackParams>
        rangeFeedback: CalculationFeedbackState
    }>()
    const emit = defineEmits<{
        'validation-state': [state: DraftValidation<Partial<BacktrackParams>>]
    }>()
    const onValidationState = (state: DraftValidation<Partial<BacktrackParams>>) => {
        emit('validation-state', state);
    };

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiTuneVariant"/> バックトラック条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <v-container class="pa-4">
                <RangePlanNotice :feedback="props.rangeFeedback" />
                <v-container class="pa-0">
                    <BacktrackForm :params="props.params" @validation-state="onValidationState"/>
                </v-container>
            </v-container>
        </v-card-text>
    </v-card>
</template>
