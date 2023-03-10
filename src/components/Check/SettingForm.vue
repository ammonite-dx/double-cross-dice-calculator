<script setup>

    import { reactive,onMounted,watch } from 'vue';

    const emit = defineEmits(['settingUpdate']);
    const setting = reactive({min:0, max:30, mode:'達成値がXとなる確率を表示'});
    const minRule = [
        value => value!=="" || '最小値を入力して下さい。',
        value => Number.isInteger(value) || '最小値は整数値として下さい。',
        value => value>=0 || '最小値は0以上として下さい。',
        value => value<=999 || '最小値は999以下として下さい。',
        value => value<setting.max || '最小値は最大値より小さくして下さい'
    ];
    const maxRule = [
        value => value!=="" || '最大値を入力して下さい。',
        value => Number.isInteger(value) || '最大値は整数値として下さい。',
        value => value>=0 || '最大値は0以上として下さい。',
        value => value<=999 || '最大値は999以下として下さい。',
        value => value>setting.min || '最大値は最小値より大きくして下さい'
    ];
    const modeItem = ['達成値がXとなる確率を表示','達成値がX以上となる確率を表示'];
    const valid = () => {
        return setting.min!=="" && Number.isInteger(setting.min) && setting.min>=0 && setting.min<=999
            && setting.max!=="" && Number.isInteger(setting.max) && setting.max>=0 && setting.max<=999
            && setting.min<setting.max;
    };
    onMounted(() => {emit("settingUpdate", setting)});
    watch(setting, () => {if (valid()) {emit("settingUpdate", setting)}});

</script>

<template>
    <v-row dense class="pt-2 ma-0">
        <v-col md="4" cols="6" class="pb-2"><v-text-field label="最小値" type="number" min=0 max=999 v-model.number="setting.min" :rules="minRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
        <v-col md="4" cols="6" class="pb-2"><v-text-field label="最大値" type="number" min=0 max=999 v-model.number="setting.max" :rules="maxRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
        <v-col md="4" cols="12" class="pb-2"><v-select label="表示モード" v-model="setting.mode" :items="modeItem" variant="underlined" hide-details="auto" density="compact"/></v-col>
    </v-row>
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