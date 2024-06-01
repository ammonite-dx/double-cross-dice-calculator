<script setup>

    import { ref,reactive,watch } from 'vue';

    const props = defineProps(['params','comboColor'])
    const form = ref();
    const showDetails = ref(false);
    const currentParams = reactive({
        score: {dice:props.params.score.dice, critical:props.params.score.critical, skill:props.params.score.skill, yousei:props.params.score.yousei, shihai:props.params.score.shihai},
        damage: {dice:props.params.damage.dice, value:props.params.damage.value, kazanari:props.params.damage.kazanari},
    });
    const diceRule = [
        value => value!=="" || 'ダイス数を入力して下さい。',
        value => Number.isInteger(value) || 'ダイス数は整数値として下さい。',
        value => value>=0 || 'ダイス数は0以上として下さい。',
        value => value<=99 || 'ダイス数は99以下として下さい。',
    ];
    const criticalRule = [
        value => value!=="" || 'クリティカル値を入力して下さい。',
        value => Number.isInteger(value) || 'クリティカル値は整数値として下さい。',
        value => value>=2 || 'クリティカル値は2以上として下さい。',
        value => value<=11 || 'クリティカル値は11以下として下さい。',
    ];
    const skillRule = [
        value => value!=="" || '技能値を入力して下さい。',
        value => Number.isInteger(value) || '技能値は整数値として下さい',
        value => value>=-999 || '技能値は-999以上として下さい。',
        value => value<=999 || '技能値は999以下として下さい。',
    ];
    const youseiRule = [
        value => value!=="" || '《妖精の手》等の回数を入力して下さい。',
        value => Number.isInteger(value) || '《妖精の手》等の回数は整数値として下さい。',
        value => value>=0 || '《妖精の手》等の回数は0以上として下さい。',
        value => value<=9 || '《妖精の手》等の回数は9以下として下さい。',
        value => (currentParams.score.shihai===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    const shihaiRule = [
        value => value!=="" || '《支配の領域》の対象となるダイス数を入力して下さい。',
        value => Number.isInteger(value) || '《支配の領域》の対象となるダイス数は整数値として下さい。',
        value => value>=0 || '《支配の領域》の対象となるダイス数は0以上として下さい。',
        value => value<=19 || '《支配の領域》の対象となるダイス数は19以下として下さい。',
        value => (currentParams.score.yousei===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    const attackDiceRule = [
        value => value!=="" || '攻撃力(ダイス)を入力して下さい。',
        value => Number.isInteger(value) || '攻撃力(ダイス)は整数値として下さい。',
        value => value>=0 || '攻撃力(ダイス)は0以上として下さい。',
        value => value<=99 || '攻撃力(ダイス)は99以下として下さい。',
    ];
    const attackValueRule = [
        value => value!=="" || '攻撃力(固定値)を入力して下さい。',
        value => Number.isInteger(value) || '攻撃力(固定値)は整数値として下さい',
        value => value>=-999 || '攻撃力(固定値)は-999以上として下さい。',
        value => value<=999 || '攻撃力(固定値)は999以下として下さい。',
    ];
    const kazanariRule = [
        value => value!=="" || '振り直せるダメージダイスの数を入力して下さい。',
        value => Number.isInteger(value) || '振り直せるダメージダイスの数は整数値として下さい。',
        value => value>=0 || '振り直せるダメージダイスの数の回数は0以上として下さい。',
        value => value<=9 || '振り直せるダメージダイスの数は9以下として下さい。',
    ];
    watch(currentParams, async () => {
        const validResult = await form.value.validate();
        if (validResult.valid) {
            props.params.score.dice = currentParams.score.dice;
            props.params.score.critical = currentParams.score.critical;
            props.params.score.skill = currentParams.score.skill;
            props.params.score.yousei = currentParams.score.yousei;
            props.params.score.shihai = currentParams.score.shihai;
            props.params.damage.dice = currentParams.damage.dice;
            props.params.damage.value = currentParams.damage.value;
            props.params.damage.kazanari = currentParams.damage.kazanari;
        }
    });

</script>

<template>
    <v-container class="px-0 pt-2 pb-0">
        <v-row class="ma-0 px-1 py-0" :style="{backgroundColor:props.comboColor}" style="color:white">
            <v-col md="8" cols="6" class="pa-0 d-flex align-center">攻撃側</v-col>
            <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetails" density="compact" class="h-50" />高度な設定を表示</v-col>
        </v-row>
        <v-form ref="form" class="pa-1">
            <v-row dense class="pt-2 ma-0">
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="ダイス数" type="number" min=0 max=99 v-model.number="currentParams.score.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.score.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><v-text-field label="技能値" type="number" min=-999 max=999 v-model.number="currentParams.score.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col md="3" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><v-text-field label="攻撃力" suffix="D10+" type="number" min=0 max=99 v-model.number="currentParams.damage.dice" :rules="attackDiceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                        <v-col cols="6" class="pl-0"><v-text-field type="number" min=-999 max=999 v-model.number="currentParams.damage.value" :rules="attackValueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <v-row v-if="showDetails" dense class="pt-2 ma-0">
                <v-col cols="4" class="pb-2"><v-text-field label="《妖精の手》等の回数" type="number" min=0 max=9 v-model.number="currentParams.score.yousei" :rules="youseiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="4" class="pb-2"><v-text-field label="《支配の領域》の対象ダイス数" type="number" min=0 max=19 v-model.number="currentParams.score.shihai" :rules="shihaiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                <v-col cols="4" class="pb-2"><v-text-field label="振り直せるダメージダイスの数" type="number" min=0 max=9 v-model.number="currentParams.damage.kazanari" :rules="kazanariRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            </v-row>
        </v-form>
    </v-container>
</template>