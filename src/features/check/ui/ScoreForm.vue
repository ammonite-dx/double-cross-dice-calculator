<script setup>

    import { onUnmounted, ref,reactive,watch } from 'vue';
    import { getChartColor } from '@/data/ColorSetter';
    import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate';

    const props = defineProps(['side', 'params']);
    const emit = defineEmits(['validated']);
    const form = ref();
    const showDetails = ref(false);
    const backgroundColor = props.side=='action' ? getChartColor(0) : getChartColor(1);
    const sideText = props.side=='action' ? 'アクション側' : 'リアクション側';
    const currentParams = reactive({
        dice: props.params.dice,
        critical: props.params.critical,
        skill: props.params.skill,
        yousei: props.params.yousei,
        shihai: props.params.shihai,
    });
    const validationGate = createLatestValidationGate();
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
        value => (currentParams.shihai===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    const shihaiRule = [
        value => value!=="" || '《支配の領域》の対象となるダイス数を入力して下さい。',
        value => Number.isSafeInteger(value) || '《支配の領域》の対象となるダイス数は整数値として下さい。',
        value => value>=0 || '《支配の領域》の対象となるダイス数は0以上として下さい。',
        value => (currentParams.yousei===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    watch(() => [
        props.params.dice,
        props.params.critical,
        props.params.skill,
        props.params.yousei,
        props.params.shihai,
    ], (values) => {
        validationGate.invalidate();
        [
            'dice',
            'critical',
            'skill',
            'yousei',
            'shihai',
        ].forEach((field, index) => {
            currentParams[field] = values[index];
        });
    });
    watch(currentParams, async () => {
        const ticket = validationGate.begin();
        const draft = { ...currentParams };
        const validResult = await form.value?.validate?.();
        if (!validationGate.canCommit(ticket)) {
            return;
        }
        if (validResult?.valid) {
            emit('validated', draft);
        }
    });
    watch(showDetails, () => {
        validationGate.invalidate();
        if (!showDetails.value) {
            currentParams.yousei = 0;
            currentParams.shihai = 0;
        }
    });
    onUnmounted(() => validationGate.dispose());

</script>

<template>
    <v-row class="ma-0 px-1 py-0" :style="{backgroundColor:backgroundColor}" style="color:white">
        <v-col md="8" cols="6" class="pa-0 d-flex align-center">{{ sideText }}</v-col>
        <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetails" density="compact" class="h-50" />高度な設定</v-col>
    </v-row>
    <v-form ref="form" class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col cols="4"><v-text-field label="ダイス数" type="number" min=0 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="技能値" type="number" v-model.number="currentParams.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
        </v-row>
        <v-row v-if="showDetails" dense class="pt-2 ma-0">
            <v-col md="6" cols="12" class="pb-2"><v-text-field label="《妖精の手》等の回数" type="number" min=0 v-model.number="currentParams.yousei" :rules="youseiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            <v-col md="6" cols="12" class="pb-2"><v-text-field label="《支配の領域》の対象ダイス数" type="number" min=0 v-model.number="currentParams.shihai" :rules="shihaiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
        </v-row>
    </v-form> 
</template>
