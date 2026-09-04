<script setup>

    import { onUnmounted, reactive, ref, watch } from 'vue';
    import {
        createAttackInputSnapshot,
    } from '@/features/attack/model/AttackInputSnapshot';
    import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate';
    import {
        createScoreFeatureCompatibilityRule,
        createScoreFieldRules,
    } from '@/shared/validation/ScoreInputRules';

    const props = defineProps(['params','comboColor','showDetails'])
    const emit = defineEmits(['validated', 'show-details'])
    const form = ref();
    const currentParams = reactive(createAttackInputSnapshot(props.params));
    const showDetails = ref(props.showDetails ?? false);
    const validationGate = createLatestValidationGate();
    const scoreRules = createScoreFieldRules();
    const diceRule = scoreRules.dice;
    const criticalRule = scoreRules.critical;
    const skillRule = scoreRules.skill;
    const youseiRule = [
        ...scoreRules.yousei,
        createScoreFeatureCompatibilityRule({
            field: 'yousei',
            getScore: () => currentParams.score,
        }),
    ];
    const shihaiRule = [
        ...scoreRules.shihai,
        createScoreFeatureCompatibilityRule({
            field: 'shihai',
            getScore: () => currentParams.score,
        }),
    ];
    const attackDiceRule = [
        value => value!=="" || '攻撃力(ダイス)を入力して下さい。',
        value => Number.isSafeInteger(value) || '攻撃力(ダイス)は整数値として下さい。',
        value => value>=0 || '攻撃力(ダイス)は0以上として下さい。',
    ];
    const attackValueRule = [
        value => value!=="" || '攻撃力(固定値)を入力して下さい。',
        value => Number.isSafeInteger(value) || '攻撃力(固定値)は整数値として下さい',
    ];
    const kazanariRule = [
        value => value!=="" || '振り直せるダメージダイスの数を入力して下さい。',
        value => Number.isSafeInteger(value) || '振り直せるダメージダイスの数は整数値として下さい。',
        value => value>=0 || '振り直せるダメージダイスの数の回数は0以上として下さい。',
    ];
    watch(currentParams, async () => {
        const ticket = validationGate.begin();
        const draft = createAttackInputSnapshot(currentParams);
        const validResult = await form.value?.validate?.();
        if (!validationGate.canCommit(ticket)) {
            return;
        }
        if (validResult?.valid) {
            emit('validated', draft);
        }
    });
    watch(showDetails, (value) => {
        const ticket = validationGate.invalidate();
        if (!validationGate.canCommit(ticket)) {
            return;
        }
        emit('show-details', value);
        if (!value) {
            currentParams.score.yousei = 0;
            currentParams.score.shihai = 0;
            currentParams.damage.kazanari = 0;
        }
    });
    onUnmounted(() => validationGate.dispose());

</script>

<template>
    <v-container class="px-0 pt-2 pb-0">
        <v-row class="ma-0 px-1 py-0" :style="{backgroundColor:props.comboColor}" style="color:white">
            <v-col md="8" cols="6" class="pa-0 d-flex align-center">攻撃側</v-col>
            <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetails" density="compact" class="h-50" />高度な設定</v-col>
        </v-row>
        <v-form ref="form" class="pa-1">
            <v-row dense class="pt-2 ma-0">
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="ダイス数" type="number" min=0 v-model.number="currentParams.score.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.score.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="技能値" type="number" v-model.number="currentParams.score.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="攻撃力" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="attackDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="attackValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <v-row v-if="showDetails" dense class="pt-2 ma-0">
                <v-col cols="4" class="pb-2"><v-text-field label="《妖精の手》等の回数" type="number" min=0 v-model.number="currentParams.score.yousei" :rules="youseiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="4" class="pb-2"><v-text-field label="《支配の領域》の対象ダイス数" type="number" min=0 v-model.number="currentParams.score.shihai" :rules="shihaiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="4" class="pb-2"><v-text-field label="振り直せるダメージダイスの数" type="number" min=0 v-model.number="currentParams.damage.kazanari" :rules="kazanariRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            </v-row>
        </v-form>
    </v-container>
</template>
