<script setup>
    import { computed } from 'vue';

    // 親コンポーネントから受け取る設定値
    const props = defineProps({
        modelValue: [Number, String], // 入力値
        label: String,                // ラベル（項目名）
        min: { type: Number, default: 0 },    // 最小値
        max: { type: Number, default: 999 },  // 最大値
        suffix: { type: String, default: '' }, // 単位などのサフィックス
        customRules: { type: Array, default: () => [] } // 追加のバリデーションルール
    });

    // 値の更新を親に通知するための定義
    const emit = defineEmits(['update:modelValue']);

    // v-modelのバインディング用（ここで数値変換を行う）
    const value = computed({
        get: () => props.modelValue,
        set: (val) => {
            // 空文字の場合はそのまま、それ以外は数値に変換して返す
            emit('update:modelValue', val === "" ? "" : Number(val));
        }
    });

    // バリデーションルールの自動生成
    const rules = computed(() => {
        const baseRules = [
            v => (v !== null && v !== undefined && String(v) !== "") || `${props.label}を入力して下さい。`,
            v => Number.isInteger(Number(v)) || `${props.label}は整数値として下さい。`,
            v => Number(v) >= props.min || `${props.label}は${props.min}以上として下さい。`,
            v => Number(v) <= props.max || `${props.label}は${props.max}以下として下さい。`,
        ];
        // 基本ルールに追加ルールを結合
        return [...baseRules, ...props.customRules];
    });
</script>

<template>
    <v-text-field
        v-model="value"
        :label="label"
        :rules="rules"
        :suffix="suffix"
        type="number"
        :min="min"
        :max="max"
        variant="underlined"
        hide-details="auto"
        density="compact"
        class="pa-0 ma-0 text-md-body-1 text-caption"
    />
</template>