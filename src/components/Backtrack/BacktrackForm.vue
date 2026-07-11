<script setup>
    import IntegerInput from '@/components/common/IntegerInput.vue';

    const props = defineProps(['params']);

    const dloisItem = ['なし', '戦闘用人格・生きる伝説', '生還者', '不死者・悪夢', '屍人', '戦友(通常)', '戦友(強化)'];
</script>

<template>
    <v-form class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col md="3" cols="6"><IntegerInput label="現在侵蝕率" suffix="%" v-model="props.params.encroachment" /></v-col>
            <v-col md="3" cols="6"><IntegerInput label="残存ロイス数" :min="0" :max="7" v-model="props.params.lois" /></v-col>
            <v-col md="3" cols="6"><IntegerInput label="Eロイス数" :min="0" :max="99" v-model="props.params.elois" /></v-col>
            <v-col md="3" cols="6" class="pb-2"><v-row dense>
                <v-col cols="6" class="pr-0"><IntegerInput label="その他減少量" suffix="D10+" :min="0" :max="99" v-model="props.params.dice" /></v-col>
                <v-col cols="6" class="pl-0"><IntegerInput :min="0" :max="999" v-model="props.params.value" /></v-col>
            </v-row></v-col>
        </v-row>
        <v-row dense class="pt-2 ma-0">
            <v-select label="バックトラックに影響するDロイス" v-model="props.params.dlois" :items="dloisItem" variant="underlined" hide-details="auto" density="compact"/>
        </v-row>
    </v-form>
</template>