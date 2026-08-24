<script setup>

    import { reactive, ref, watch } from 'vue';
    import {
        ATTACK_DISPLAY_MODES,
        createAttackDisplayRequestSnapshot,
    } from '@/application/AttackDisplayRequestSnapshot';

    const props = defineProps({
        displayRequest: {
            type: Object,
            required: true,
        },
    });
    const emit = defineEmits(['validated']);
    const form = ref();
    const currentRequest = reactive({
        min: props.displayRequest.min,
        max: props.displayRequest.max,
        mode: props.displayRequest.mode,
    });
    const modeItem = [
        {
            title: '達成値がXとなる確率を表示',
            value: ATTACK_DISPLAY_MODES.PMF,
        },
        {
            title: '達成値がX以上となる確率を表示',
            value: ATTACK_DISPLAY_MODES.UPPER_TAIL,
        },
    ];
    let validationGeneration = 0;

    const isSafeCoordinate = (value) =>
        Number.isSafeInteger(value) && value >= 0;
    const minRule = [
        value => value !== '' || '最小値を入力して下さい。',
        value => isSafeCoordinate(value) || '最小値は0以上の安全な整数値として下さい。',
        value => value <= currentRequest.max || '最小値は最大値以下にして下さい',
    ];
    const maxRule = [
        value => value !== '' || '最大値を入力して下さい。',
        value => isSafeCoordinate(value) || '最大値は0以上の安全な整数値として下さい。',
        value => value >= currentRequest.min || '最大値は最小値以上にして下さい',
    ];

    watch(() => [
        props.displayRequest.min,
        props.displayRequest.max,
        props.displayRequest.mode,
    ], ([min, max, mode]) => {
        validationGeneration += 1;
        currentRequest.min = min;
        currentRequest.max = max;
        currentRequest.mode = mode;
    });

    watch(currentRequest, async () => {
        const generation = ++validationGeneration;
        const draft = {
            min: currentRequest.min,
            max: currentRequest.max,
            mode: currentRequest.mode,
        };
        const validResult = await form.value?.validate?.();
        if (generation !== validationGeneration || !validResult?.valid) {
            return;
        }
        try {
            emit('validated', createAttackDisplayRequestSnapshot(draft));
        } catch {
            // Vuetify rules are the user-facing boundary; keep the event
            // contract defensive when a custom input bypasses a rule.
        }
    });

</script>

<template>
    <v-form ref="form">
        <v-row dense class="pt-2 ma-0">
            <v-col cols="6" class="pb-2"><v-text-field label="最小値" type="number" min="0" v-model.number="currentRequest.min" :rules="minRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
            <v-col cols="6" class="pb-2"><v-text-field label="最大値" type="number" min="0" v-model.number="currentRequest.max" :rules="maxRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
            <v-col cols="12" class="pb-2"><v-select label="表示モード" v-model="currentRequest.mode" :items="modeItem" variant="underlined" hide-details="auto" density="compact"/></v-col>
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
