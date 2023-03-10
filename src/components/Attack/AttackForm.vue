<script setup>

    import { reactive,watch } from 'vue';

    const props = defineProps(['params'])
    const currentParams = reactive({
        score: {dice:props.params.score.dice, critical:props.params.score.critical, skill:props.params.score.skill},
        damage: {dice:props.params.damage.dice, value:props.params.damage.value},
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
    const valid = () => {
        return currentParams.score.dice!=="" && Number.isInteger(currentParams.score.dice) && currentParams.score.dice>=0 && currentParams.score.dice<=99
            && currentParams.score.critical!=="" && Number.isInteger(currentParams.score.critical) && currentParams.score.critical>=2 && currentParams.score.critical<=11
            && currentParams.score.skill!=="" && Number.isInteger(currentParams.score.skill) && currentParams.score.skill>=-999 && currentParams.score.skill<=999
            && currentParams.damage.dice!=="" && Number.isInteger(currentParams.damage.dice) && currentParams.damage.dice>=0 && currentParams.damage.dice<=99
            && currentParams.damage.value!=="" && Number.isInteger(currentParams.damage.value) && currentParams.damage.value>=-999 && currentParams.damage.value<=999;
    };
    watch(currentParams, () => {
        if (valid()) {
            props.params.score.dice = currentParams.score.dice;
            props.params.score.critical = currentParams.score.critical;
            props.params.score.skill = currentParams.score.skill;
            props.params.damage.dice = currentParams.damage.dice;
            props.params.damage.value = currentParams.damage.value;
        }
    });

</script>

<template>
    <v-container class="pa-1">
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
    </v-container>
</template>