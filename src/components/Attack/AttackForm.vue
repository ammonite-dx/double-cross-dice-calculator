<script setup>

    import { computed } from 'vue';
    import IntegerInput from '@/components/common/IntegerInput.vue';

    // 親から params を受け取り、バリデーション状態 (valid) を返す
    const props = defineProps(['params','comboColor','showDetails', 'modelValue']);
    const emit = defineEmits(['update:modelValue']);

    // フォームのバリデーション状態を親に同期させる
    const isValid = computed({
        get: () => props.modelValue,
        set: (val) => emit('update:modelValue', val)
    });

    // 特殊なバリデーションルール
    const youseiExclusiveRule = value => (currentParams.score.shihai===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。';
    const shihaiExclusiveRule = value => (currentParams.score.yousei===0 || value===0) || '《妖精の手》と《支配の領域》の同時利用には対応していません。';

</script>

<template>
    <v-container class="px-0 pt-2 pb-0">
        <v-row class="ma-0 px-1 py-0" :style="{backgroundColor:props.comboColor}" style="color:white">
            <v-col md="8" cols="6" class="pa-0 d-flex align-center">攻撃側</v-col>
            <v-col md="4" cols="6" class="pa-0 d-flex align-center text-caption"><v-checkbox-btn v-model="currentShowDetails.value" density="compact" class="h-50" />高度な設定</v-col>
        </v-row>
        <v-form ref="form" class="pa-1">
            <v-row dense class="pt-2 ma-0">
                <v-col md="3" cols="4" class="pb-2"><integer-input label="ダイス数" :min=0 :max=99 v-model="currentParams.score.dice"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><integer-input label="クリティカル値" :min=2 :max=11 v-model="currentParams.score.critical"/></v-col>
                <v-col md="3" cols="4" class="pb-2"><integer-input label="技能値" :min=-999 :max=999 v-model="currentParams.score.skill"/></v-col>
                <v-col md="3" cols="12" class="pb-2">
                    <v-row dense>
                        <v-col cols="6" class="pr-0"><integer-input label="攻撃力" suffix="D10+" :min=0 :max=99 v-model="currentParams.damage.dice"/></v-col>
                        <v-col cols="6" class="pl-0"><integer-input :min=-999 :max=999 v-model="currentParams.damage.value"/></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <v-row v-if="props.showDetails.value" dense class="pt-2 ma-0">
                <v-col cols="4" class="pb-2"><integer-input label="《妖精の手》等の回数" :min=0 :max=9 v-model="currentParams.score.yousei" :custom-rules="[youseiExclusiveRule]"/></v-col>
                <v-col cols="4" class="pb-2"><integer-input label="《支配の領域》の対象ダイス数" :min=0 :max=19 v-model="currentParams.score.shihai" :custom-rules="[shihaiExclusiveRule]"/></v-col>
                <v-col cols="4" class="pb-2"><integer-input label="振り直せるダメージダイスの数" :min=0 :max=9 v-model="currentParams.damage.kazanari"/></v-col>
            </v-row>
        </v-form>
    </v-container>
</template>