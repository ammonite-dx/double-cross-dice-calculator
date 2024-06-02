<script setup>

    import { ref,reactive,watch } from 'vue';
    import { getChartColor } from '@/data/ColorSetter';

    const props = defineProps(['side', 'params']);
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
        value => (currentParams.shihai===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    const shihaiRule = [
        value => value!=="" || '《支配の領域》の対象となるダイス数を入力して下さい。',
        value => Number.isInteger(value) || '《支配の領域》の対象となるダイス数は整数値として下さい。',
        value => value>=0 || '《支配の領域》の対象となるダイス数は0以上として下さい。',
        value => value<=19 || '《支配の領域》の対象となるダイス数は19以下として下さい。',
        value => (currentParams.yousei===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。',
    ];
    watch(currentParams, async () => {
        const validResult = await form.value.validate();
        if (validResult.valid) {
            props.params.dice = currentParams.dice;
            props.params.critical = currentParams.critical;
            props.params.skill = currentParams.skill;
            props.params.yousei = currentParams.yousei;
            props.params.shihai = currentParams.shihai;
        }
    });
    watch(showDetails, () => {
        if (!showDetails.value) {
            currentParams.yousei = 0;
            currentParams.shihai = 0;
        }
    });

</script>

<template>
    <v-row class="ma-0 px-1 py-0" :style="{backgroundColor:backgroundColor}" style="color:white">
        <v-col md="8" cols="6" class="pa-0 d-flex align-center">{{ sideText }}</v-col>
        <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetails" density="compact" class="h-50" />高度な設定</v-col>
    </v-row>
    <v-form ref="form" class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col cols="4"><v-text-field label="ダイス数" type="number" min=0 max=99 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="技能値" type="number" min=-999 max=999 v-model.number="currentParams.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
        </v-row>
        <v-row v-if="showDetails" dense class="pt-2 ma-0">
            <v-col md="6" cols="12" class="pb-2"><v-text-field label="《妖精の手》等の回数" type="number" min=0 max=9 v-model.number="currentParams.yousei" :rules="youseiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
            <v-col md="6" cols="12" class="pb-2"><v-text-field label="《支配の領域》の対象ダイス数" type="number" min=0 max=19 v-model.number="currentParams.shihai" :rules="shihaiRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
        </v-row>
    </v-form> 
</template>