<script setup>

    import { ref,reactive,watch } from 'vue';

    const props = defineProps(['dfclty']);
    const form = ref();
    const currentDfclty = reactive({opposed:props.dfclty.opposed, target:props.dfclty.target});
    const targetRule = [
        value => value!=="" || '難易度を入力して下さい。',
        value => Number.isInteger(value) || '難易度は数値として下さい。',
        value => value>=0 || '難易度は0以上として下さい。',
        value => value<=999 || '難易度は999以下として下さい。',
    ];
    watch(currentDfclty, async () => {
        const validResult = await form.value.validate();
        if (validResult.valid) {
            props.dfclty.opposed = currentDfclty.opposed;
            props.dfclty.target = currentDfclty.target;
        }
    });

</script>

<template>
    <v-form ref="form" class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col md="4" cols="6" class="pb-2">
                <v-text-field v-if="dfclty.opposed" label="難易度" model-value="対決" readonly variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption pa-0" />
                <v-text-field v-else label="難易度" type="number" min=0 max=999 v-model.number="currentDfclty.target" :rules="targetRule" variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption pa-0" />
            </v-col>
            <v-col md="4" cols="6" class="pb-2">
                <v-switch color="#404040" v-model="currentDfclty.opposed" label="対決判定" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption" />
            </v-col>
        </v-row>
    </v-form>
</template>