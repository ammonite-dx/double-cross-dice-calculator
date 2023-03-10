<script setup>

    import { reactive,watch } from 'vue';

    const props = defineProps(['params']);
    const currentParams = reactive({
        dice: props.params.dice,
        critical: props.params.critical,
        skill: props.params.skill,
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
    const valid = () => {
        return currentParams.dice!=="" && Number.isInteger(currentParams.dice) && currentParams.dice>=0 && currentParams.dice<=99
            && currentParams.critical!=="" && Number.isInteger(currentParams.critical) && currentParams.critical>=2 && currentParams.critical<=11
            && currentParams.skill!=="" && Number.isInteger(currentParams.skill) && currentParams.skill>=-999 && currentParams.skill<=999;
    };
    watch(currentParams, () => {
        if (valid()) {
            props.params.dice = currentParams.dice;
            props.params.critical = currentParams.critical;
            props.params.skill = currentParams.skill;
        }
    });

</script>

<template>
    <v-container class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col cols="4"><v-text-field label="ダイス数" type="number" min=0 max=99 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="クリティカル値" type="number" min=2 max=11 v-model.number="currentParams.critical" :rules="criticalRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col cols="4"><v-text-field label="技能値" type="number" min=-999 max=999 v-model.number="currentParams.skill" :rules="skillRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
        </v-row>
    </v-container>
</template>