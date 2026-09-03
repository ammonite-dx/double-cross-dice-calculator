<script setup>

    import { onUnmounted, reactive, ref, watch } from 'vue';
    import {
        createDefenceInputDraftSnapshot,
        normalizeDefenceInputDraft,
    } from '@/application/AttackInputSnapshot';
    import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate';

    const props = defineProps(['params','comboColor','showDetails']);
    const emit = defineEmits(['validated', 'show-details']);
    const form = ref();
    const currentParams = reactive(createDefenceInputDraftSnapshot(props.params));
    const showDetails = ref(props.showDetails?.value ?? false);
    const validationGate = createLatestValidationGate();
    const modeItem = ['ドッジ','《イベイジョン》','ガード・リアクション放棄']
    const diceRule = [
        value => value!=="" || 'ダイス数を入力して下さい。',
        value => Number.isSafeInteger(value) || 'ダイス数は整数値として下さい。',
        value => value>=0 || 'ダイス数は0以上として下さい。',
    ];
    const criticalRule = [
        value => value!=="" || 'クリティカル値を入力して下さい。',
        value => Number.isSafeInteger(value) || 'クリティカル値は整数値として下さい。',
        value => value>=2 || 'クリティカル値は2以上として下さい。',
        value => value<=11 || 'クリティカル値は11以下として下さい。',
    ];
    const skillRule = [
        value => value!=="" || '技能値を入力して下さい。',
        value => Number.isSafeInteger(value) || '技能値は整数値として下さい',
    ];
    const youseiRule = [
        value => value!=="" || '《妖精の手》等の回数を入力して下さい。',
        value => Number.isSafeInteger(value) || '《妖精の手》等の回数は整数値として下さい。',
        value => value>=0 || '《妖精の手》等の回数は0以上として下さい。',
    ];
    const shihaiRule = [
        value => value!=="" || '《支配の領域》の対象となるダイス数を入力して下さい。',
        value => Number.isSafeInteger(value) || '《支配の領域》の対象となるダイス数は整数値として下さい。',
        value => value>=0 || '《支配の領域》の対象となるダイス数は0以上として下さい。',
        value => (currentParams.score.yousei===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    const defenceDiceRule = [
        value => value!=="" || 'ガード・装甲・軽減値(ダイス)を入力して下さい。',
        value => Number.isSafeInteger(value) || 'ガード・装甲・軽減値(ダイス)は整数値として下さい。',
        value => value>=0 || 'ガード・装甲・軽減値(ダイス)は0以上として下さい。',
    ];
    const defenceValueRule = [
        value => value!=="" || 'ガード・装甲・軽減値(固定値)を入力して下さい。',
        value => Number.isSafeInteger(value) || 'ガード・装甲・軽減値(固定値)は整数値として下さい',
    ];
    watch(currentParams, async () => {
        const ticket = validationGate.begin();
        const draft = createDefenceInputDraftSnapshot(currentParams);
        const validResult = await form.value?.validate?.();
        if (!validationGate.canCommit(ticket)) {
            return;
        }
        if (!validResult?.valid) {
            return;
        }
        const snapshot = normalizeDefenceInputDraft(draft);
        if (snapshot === null) {
            console.log('防御の種別が確定できません。');
            return;
        }
        emit('validated', snapshot);
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
        }
    });
    onUnmounted(() => validationGate.dispose());

</script>

<template>
    <v-container class="px-0 pt-2 pb-0">
        <v-row class="ma-0 px-1 py-0" :style="{backgroundColor:props.comboColor}" style="color:white">
            <v-col md="8" cols="6" class="pa-0 d-flex align-center">防御側</v-col>
            <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetails" density="compact" class="h-50" />高度な設定</v-col>
        </v-row>
        <v-form ref="form" class="pa-1">
            <v-row dense class="pt-2 ma-0">
                <v-select label="種別" v-model="currentParams.mode" :items="modeItem" variant="underlined" hide-details="auto" density="compact"/>
            </v-row>
            <v-row v-if="currentParams.mode=='ドッジ'" dense class="pt-2 ma-0">
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="ダイス数" type="number" min=0 v-model.number="currentParams.score.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.score.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="技能値" type="number" v-model.number="currentParams.score.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="装甲・軽減値" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <v-row v-if="currentParams.mode=='ドッジ' && showDetails" dense class="pt-2 ma-0">
                <v-col cols="6" class="pb-2"><v-text-field label="《妖精の手》等の回数" type="number" min=0 v-model.number="currentParams.score.yousei" :rules="youseiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="6" class="pb-2"><v-text-field label="《支配の領域》の対象ダイス数" type="number" min=0 v-model.number="currentParams.score.shihai" :rules="shihaiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            </v-row>
            <v-row v-if="currentParams.mode=='《イベイジョン》'" dense class="pt-2 ma-0">
                <v-col md="4" cols="6" class="pb-2"><v-text-field label="ダイス数" type="number" min=0 v-model.number="currentParams.score.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="4" cols="6" class="pb-2"><v-text-field label="技能値" type="number" v-model.number="currentParams.score.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="4" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="装甲・軽減値" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <v-row v-if="currentParams.mode=='ガード・リアクション放棄'" dense class="pt-2 ma-0">
                <v-col cols="6" class="pr-0"><v-text-field label="ガード・装甲・軽減値" suffix="D10+" type="number" min=0 v-model.number="currentParams.damage.dice" :rules="defenceDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="6" class="pl-0"><v-text-field type="number" v-model.number="currentParams.damage.value" :rules="defenceValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            </v-row>
        </v-form>
    </v-container>
</template>
