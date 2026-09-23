<script setup lang="ts">

    import { ref,reactive,useId,watch } from 'vue';
    import { INPUT_DOMAIN } from '@/domain/InputDomain';
    import { createSafeIntegerRules } from '@/shared/validation/IntegerRules';
    import type { BacktrackParams } from '@/domain/BacktrackRules'

    const props = defineProps<{ params: Partial<BacktrackParams> }>()
    const emit = defineEmits<{
        validated: [params: Partial<BacktrackParams>]
    }>()
    const form = ref<{ validate?: () => Promise<{ valid: boolean }> } | null>(null);
    const currentParams = reactive<Partial<BacktrackParams>>({
        encroachment: props.params.encroachment,
        lois: props.params.lois,
        elois: props.params.elois,
        dice: props.params.dice,
        value: props.params.value,
        dlois: props.params.dlois,
    });
    const otherReductionGroupId = useId();
    let validationGeneration = 0;
    const dloisItem = ['なし', '戦闘用人格・生きる伝説', '生還者', '不死者・悪夢', '屍人', '戦友(通常)', '戦友(強化)']
    const encroachmentRule = createSafeIntegerRules({
        requiredMessage: '現在侵蝕率を入力して下さい。',
        integerMessage: '現在侵蝕率は整数値として下さい。',
    });
    const loisRule = createSafeIntegerRules({
        requiredMessage: '残存ロイス数を入力して下さい。',
        integerMessage: '残存ロイス数は整数値として下さい。',
        min: INPUT_DOMAIN.remainingLois.min,
        minMessage: '残存ロイス数は0以上として下さい。',
        max: INPUT_DOMAIN.remainingLois.max,
        maxMessage: '残存ロイス数は7以下として下さい。',
    });
    const eloisRule = createSafeIntegerRules({
        requiredMessage: 'Eロイス数を入力して下さい。',
        integerMessage: 'Eロイス数は整数値として下さい',
        min: 0,
        minMessage: 'Eロイス数は0以上として下さい。',
    });
    const diceRule = createSafeIntegerRules({
        requiredMessage: '減少量(ダイス)を入力して下さい。',
        integerMessage: '減少量(ダイス)は整数値として下さい',
        min: 0,
        minMessage: '減少量(ダイス)は0以上として下さい。',
    });
    const valueRule = createSafeIntegerRules({
        requiredMessage: '減少量(固定値)を入力して下さい。',
        integerMessage: '減少量(固定値)は整数値として下さい',
        min: 0,
        minMessage: '減少量(固定値)は0以上として下さい。',
    });
    watch(() => [
        props.params.encroachment,
        props.params.lois,
        props.params.elois,
        props.params.dice,
        props.params.value,
        props.params.dlois,
    ] as const, (values) => {
        validationGeneration += 1;
        [currentParams.encroachment, currentParams.lois, currentParams.elois,
            currentParams.dice, currentParams.value, currentParams.dlois] = values;
    });
    watch(currentParams, async () => {
        const generation = ++validationGeneration;
        const draft = { ...currentParams };
        const validResult = await form.value?.validate?.();
        if (generation !== validationGeneration) {
            return;
        }
        if (validResult?.valid) {
            emit('validated', draft);
        }
    });

</script>

<template>
    <v-form ref="form" class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col md="3" cols="6"><v-text-field label="現在侵蝕率" suffix="%" type="number" v-model.number="currentParams.encroachment" :rules="encroachmentRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col md="3" cols="6"><v-text-field label="残存ロイス数" type="number" min=0 :max="INPUT_DOMAIN.remainingLois.max" v-model.number="currentParams.lois" :rules="loisRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col md="3" cols="6"><v-text-field label="Eロイス数" type="number" min=0 v-model.number="currentParams.elois" :rules="eloisRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col md="3" cols="6" class="pb-2">
                <div
                    class="other-reduction-group"
                    role="group"
                    :aria-labelledby="otherReductionGroupId"
                >
                    <span
                        :id="otherReductionGroupId"
                        class="other-reduction-group__label text-caption text-medium-emphasis"
                    >その他減少量</span>
                    <v-row dense>
                        <v-col cols="6" class="pr-0">
                            <v-text-field label="その他減少量（ダイス）" suffix="D10+" type="number" min=0 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                <template #label><span class="d-sr-only">その他減少量（ダイス）</span></template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="6" class="pl-0">
                            <v-text-field label="その他減少量（固定値）" type="number" min=0 v-model.number="currentParams.value" :rules="valueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption">
                                <template #label><span class="d-sr-only">その他減少量（固定値）</span></template>
                            </v-text-field>
                        </v-col>
                    </v-row>
                </div>
            </v-col>
        </v-row>
        <v-row dense class="pt-2 ma-0">
            <v-select label="バックトラックに影響するDロイス" v-model="currentParams.dlois" :items="dloisItem" variant="underlined" hide-details="auto" density="compact"/>
        </v-row>
    </v-form>
</template>

<style scoped>
    .other-reduction-group {
        position: relative;
    }

    .other-reduction-group__label {
        position: absolute;
        inset-block-start: -4px;
        inset-inline-start: 0;
        z-index: 1;
        pointer-events: none;
    }
</style>
