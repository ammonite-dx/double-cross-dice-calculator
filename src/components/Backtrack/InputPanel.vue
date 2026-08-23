<script setup>

    import InputForm from './InputForm.vue';
    import RangePlanNotice from '@/components/RangePlanNotice.vue';
    import { mdiTuneVariant } from '@mdi/js'

    const props = defineProps({
        backtrackData: {
            type: Object,
            required: true,
        },
        canonicalOptIn: {
            type: Boolean,
            default: false,
        },
    });
    const emit = defineEmits(['validated', 'canonical-toggle']);
    const onValidated = (params) => {
        emit('validated', params);
    };
    const onCanonicalToggle = (value) => {
        emit('canonical-toggle', value === true);
    };

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiTuneVariant"/> バックトラック条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <v-container class="pa-4">
                <RangePlanNotice :feedback="props.backtrackData.rangeFeedback" />
                <v-switch
                    :model-value="props.canonicalOptIn"
                    label="canonical検証経路（Phase 7で削除予定）"
                    color="primary"
                    hide-details="auto"
                    density="compact"
                    class="mb-2"
                    @update:model-value="onCanonicalToggle"
                />
                <InputForm :backtrackData="props.backtrackData" @validated="onValidated"/>
            </v-container>
        </v-card-text>
    </v-card>
</template>
