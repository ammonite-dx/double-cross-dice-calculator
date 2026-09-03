<script setup>

    import { onUnmounted, reactive, ref, watch } from 'vue';
    import {
        CHECK_DISPLAY_MODES,
        createCheckDisplayRequestSnapshot,
    } from '@/features/check/model/CheckDisplayRequestSnapshot';
    import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate';
    import { createDisplayRangeRules } from '@/shared/validation/DisplayRangeRules';

    const props = defineProps({
        displayRequest: {
            type: Object,
            required: true,
        },
    });
    const emit = defineEmits(['validated']);
    const form = ref();
    const modeLabels = Object.freeze({
        [CHECK_DISPLAY_MODES.PMF]: '達成値がXとなる確率を表示',
        [CHECK_DISPLAY_MODES.UPPER_TAIL]: '達成値がX以上となる確率を表示',
    });
    const currentRequest = reactive({
        min: props.displayRequest.min,
        max: props.displayRequest.max,
        mode: props.displayRequest.mode,
    });
    const modeItem = [
        {
            title: modeLabels[CHECK_DISPLAY_MODES.PMF],
            value: CHECK_DISPLAY_MODES.PMF,
        },
        {
            title: modeLabels[CHECK_DISPLAY_MODES.UPPER_TAIL],
            value: CHECK_DISPLAY_MODES.UPPER_TAIL,
        },
    ];
    const validationGate = createLatestValidationGate();

    const { min: minRule, max: maxRule } = createDisplayRangeRules(
        () => currentRequest,
    );

    watch(() => [
        props.displayRequest.min,
        props.displayRequest.max,
        props.displayRequest.mode,
    ], ([min, max, mode]) => {
        validationGate.invalidate();
        currentRequest.min = min;
        currentRequest.max = max;
        currentRequest.mode = mode;
    });

    watch(currentRequest, async () => {
        const ticket = validationGate.begin();
        const draft = {
            min: currentRequest.min,
            max: currentRequest.max,
            mode: currentRequest.mode,
        };
        const validResult = await form.value?.validate?.();
        if (!validationGate.canCommit(ticket)) {
            return;
        }
        if (!validResult?.valid) {
            return;
        }
        try {
            const snapshot = createCheckDisplayRequestSnapshot(draft);
            emit('validated', snapshot);
        } catch {
            // Vuetify rules are the user-facing validation boundary. Keep the
            // request contract defensive if a custom input bypasses a rule.
        }
    });
    onUnmounted(() => validationGate.dispose());

</script>

<template>
    <v-form ref="form">
        <v-row dense class="pt-2 ma-0">
            <v-col md="4" cols="6" class="pb-2"><v-text-field label="最小値" type="number" min="0" v-model.number="currentRequest.min" :rules="minRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
            <v-col md="4" cols="6" class="pb-2"><v-text-field label="最大値" type="number" min="0" v-model.number="currentRequest.max" :rules="maxRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
            <v-col md="4" cols="12" class="pb-2"><v-select label="表示モード" v-model="currentRequest.mode" :items="modeItem" variant="underlined" hide-details="auto" density="compact"/></v-col>
        </v-row>
    </v-form>
</template>

<style>
div.v-select__selection {
    margin-bottom: 0;
}
span.v-select__selection-text {
    display: inline-flex;
    flex-wrap: wrap;
    font-size: 12px;
    align-content: center;
}
div.v-field__input {
    height: 40px;
}
</style>
