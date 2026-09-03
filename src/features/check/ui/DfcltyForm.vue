<script setup>

    import { onUnmounted, ref,reactive,watch } from 'vue';
    import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate';

    const props = defineProps(['dfclty']);
    const emit = defineEmits(['validated']);
    const form = ref();
    const currentDfclty = reactive({opposed:props.dfclty.opposed, target:props.dfclty.target});
    const validationGate = createLatestValidationGate();
    const targetRule = [
        value => value!=="" || '難易度を入力して下さい。',
        value => Number.isSafeInteger(value) || '難易度は数値として下さい。',
        value => value>=0 || '難易度は0以上として下さい。',
    ];
    watch(() => [props.dfclty.opposed, props.dfclty.target], ([opposed, target]) => {
        validationGate.invalidate();
        currentDfclty.opposed = opposed;
        currentDfclty.target = target;
    });
    watch(currentDfclty, async () => {
        const ticket = validationGate.begin();
        const draft = { ...currentDfclty };
        const validResult = await form.value?.validate?.();
        if (!validationGate.canCommit(ticket)) {
            return;
        }
        if (validResult?.valid) {
            emit('validated', draft);
        }
    });
    onUnmounted(() => validationGate.dispose());

</script>

<template>
    <v-form ref="form" class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col md="4" cols="6" class="pb-2">
                <v-text-field v-if="currentDfclty.opposed" label="難易度" model-value="対決" readonly variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption pa-0" />
                <v-text-field v-else label="難易度" type="number" min=0 v-model.number="currentDfclty.target" :rules="targetRule" variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption pa-0" />
            </v-col>
            <v-col md="4" cols="6" class="pb-2">
                <v-switch color="#404040" v-model="currentDfclty.opposed" label="対決判定" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" />
            </v-col>
        </v-row>
    </v-form>
</template>
