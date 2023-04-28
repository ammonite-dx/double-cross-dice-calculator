<script setup>

    import { ref,reactive,watch } from 'vue';

    const props = defineProps(['setting']);
    const form = ref();
    const currentSetting = reactive({min:props.setting.min, max:props.setting.max, mode:props.setting.mode});
    const minRule = [
        value => value!=="" || '最小値を入力して下さい。',
        value => Number.isInteger(value) || '最小値は整数値として下さい。',
        value => value>=0 || '最小値は0以上として下さい。',
        value => value<=999 || '最小値は999以下として下さい。',
        value => value<currentSetting.max || '最小値は最大値より小さくして下さい'
    ];
    const maxRule = [
        value => value!=="" || '最大値を入力して下さい。',
        value => Number.isInteger(value) || '最大値は整数値として下さい。',
        value => value>=0 || '最大値は0以上として下さい。',
        value => value<=999 || '最大値は999以下として下さい。',
        value => value>currentSetting.min || '最大値は最小値より大きくして下さい'
    ];
    const modeItem = ['ダメージがXとなる確率を表示','ダメージがX以上となる確率を表示'];
    watch(currentSetting, () => {
        if (form.value.validate()) {
            props.setting.min = currentSetting.min;
            props.setting.max = currentSetting.max;
            props.setting.mode = currentSetting.mode;
        }
    });

</script>

<template>
    <v-form ref="form">
        <v-row dense class="pt-2 ma-0">
            <v-col cols="6" class="pb-2"><v-text-field label="最小値" type="number" min=0 max=999 v-model.number="currentSetting.min" :rules="minRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
            <v-col cols="6" class="pb-2"><v-text-field label="最大値" type="number" min=0 max=999 v-model.number="currentSetting.max" :rules="maxRule" variant="underlined" hide-details="auto" density="compact"/></v-col>
            <v-col cols="12" class="pb-2"><v-select label="表示モード" v-model="currentSetting.mode" :items="modeItem" variant="underlined" hide-details="auto" density="compact"/></v-col>
        </v-row>
    </v-form>
</template>