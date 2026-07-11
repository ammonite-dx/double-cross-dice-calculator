<script setup>
import { ref, watch } from 'vue';
import IntegerInput from '@/components/common/IntegerInput.vue';
import { CHART_COLORS } from '@/utils/chart';
import * as v from '@/utils/validators';

const props = defineProps(['params', 'dfclty']);

// 高度な設定の表示フラグ
const showDetailsAction = ref(false);
const showDetailsReaction = ref(false);

// 設定を閉じたら値をリセットする監視ロジック
watch(showDetailsAction, (val) => {
    if (!val) {
        props.params.action.yousei = 0;
        props.params.action.shihai = 0;
    }
});
watch(showDetailsReaction, (val) => {
    if (!val) {
        props.params.reaction.yousei = 0;
        props.params.reaction.shihai = 0;
    }
});

// 排他ルールの生成ヘルパー
const getExclusiveRule = (yousei, shihai) => {
    return v.isExclusiveYouseiShihai(yousei, shihai) || '《妖精の手》と《支配の領域》の同時利用には対応していません。';
};

</script>

<template>
    <v-form class="pa-1">
        <v-row dense class="align-center pb-2">
            <v-col cols="4" v-if="props.dfclty.opposed"><v-text-field model-value="対決" label="難易度" variant="underlined" hide-details="auto" density="compact" readonly class="pa-0 ma-0 text-md-body-1 text-caption" /></v-col>
            <v-col cols="4" v-else><IntegerInput label="難易度" :min="0" :max="999" v-model="props.dfclty.target" /></v-col>
            <v-col cols="4"><v-switch v-model="props.dfclty.opposed" label="対決判定" hide-details density="compact" class="ma-0" /></v-col>
        </v-row>
        <v-row class="ma-0 px-1 py-0 mb-2" :style="{ backgroundColor: CHART_COLORS.primary }" style="color:white">
            <v-col md="8" cols="6" class="pa-0 d-flex align-center">アクション側</v-col>
            <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetailsAction" density="compact" class="h-50" />高度な設定</v-col>
        </v-row>
        <v-row dense class="ma-0 mb-4">
            <v-col cols="4"><IntegerInput label="ダイス数" :min="1" :max="99" v-model="props.params.action.dice" /></v-col>
            <v-col cols="4"><IntegerInput label="クリティカル値" :min="2" :max="11" v-model="props.params.action.critical" /></v-col>
            <v-col cols="4"><IntegerInput label="技能値" :min="-999" :max="999" v-model="props.params.action.skill" /></v-col>      
            <template v-if="showDetailsAction">
                <v-col md="6" cols="12"><IntegerInput label="《妖精の手》等の回数" :min="0" :max="9" v-model="props.params.action.yousei" :custom-rules="[val => getExclusiveRule(val, props.params.action.shihai)]"/></v-col>
                <v-col md="6" cols="12"><IntegerInput label="《支配の領域》の対象ダイス数" :min="0" :max="19" v-model="props.params.action.shihai" :custom-rules="[val => getExclusiveRule(props.params.action.yousei, val)]"/></v-col>
            </template>
        </v-row>
        <template v-if="props.dfclty.opposed">
            <v-row class="ma-0 px-1 py-0 mb-2" :style="{ backgroundColor: CHART_COLORS.secondary }" style="color:white">
                <v-col md="8" cols="6" class="pa-0 d-flex align-center">リアクション側</v-col>
                <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="showDetailsReaction" density="compact" class="h-50" />高度な設定</v-col>
            </v-row>
            <v-row dense class="ma-0">
                <v-col cols="4"><IntegerInput label="ダイス数" :min="1" :max="99" v-model="props.params.reaction.dice" /></v-col>
                <v-col cols="4"><IntegerInput label="クリティカル値" :min="2" :max="11" v-model="props.params.reaction.critical" /></v-col>
                <v-col cols="4"><IntegerInput label="技能値" :min="-999" :max="999" v-model="props.params.reaction.skill" /></v-col>
                <template v-if="showDetailsReaction">
                    <v-col md="6" cols="12"><IntegerInput label="《妖精の手》等の回数" :min="0" :max="9" v-model="props.params.reaction.yousei" :custom-rules="[val => getExclusiveRule(val, props.params.reaction.shihai)]"/></v-col>
                    <v-col md="6" cols="12"><IntegerInput label="《支配の領域》の対象ダイス数" :min="0" :max="19" v-model="props.params.reaction.shihai" :custom-rules="[val => getExclusiveRule(props.params.reaction.yousei, val)]"/></v-col>
                </template>
            </v-row>
        </template>
    </v-form>
</template>