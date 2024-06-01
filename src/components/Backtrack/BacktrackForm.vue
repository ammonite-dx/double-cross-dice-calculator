<script setup>

    import { ref,reactive,watch } from 'vue';

    const props = defineProps(['params']);
    const form = ref();
    const currentParams = reactive({
        encroachment: props.params.encroachment,
        lois: props.params.lois,
        elois: props.params.elois,
        dice: props.params.dice,
        value: props.params.value,
        dlois: props.params.dlois,
    });
    const dloisItem = ['なし', '戦闘用人格・生きる伝説', '生還者', '不死者・悪夢', '屍人', '戦友(通常)', '戦友(強化)']
    const encroachmentRule = [
        value => value!=="" || '現在侵蝕率を入力して下さい。',
        value => Number.isInteger(value) || '現在侵蝕率は整数値として下さい。',
    ];
    const loisRule = [
        value => value!=="" || '残存ロイス数を入力して下さい。',
        value => Number.isInteger(value) || '残存ロイス数は整数値として下さい。',
        value => value>=0 || '残存ロイス数は0以上として下さい。',
        value => value<=7 || '残存ロイス数は7以下として下さい。',
    ];
    const eloisRule = [
        value => value!=="" || 'Eロイス数を入力して下さい。',
        value => Number.isInteger(value) || 'Eロイス数は整数値として下さい',
        value => value>=0 || 'Eロイス数は0以上として下さい。',
        value => value<=99 || 'Eロイス数は99以下として下さい。',
    ];
    const diceRule = [
        value => value!=="" || '減少量(ダイス)を入力して下さい。',
        value => Number.isInteger(value) || '減少量(ダイス)は整数値として下さい',
        value => value>=0 || '減少量(ダイス)は0以上として下さい。',
        value => value<=99 || '減少量(ダイス)は99以下として下さい。',
    ];
    const valueRule = [
        value => value!=="" || '減少量(固定値)を入力して下さい。',
        value => Number.isInteger(value) || '減少量(固定値)は整数値として下さい',
        value => value>=0 || '減少量(固定値)は0以上として下さい。',
        value => value<=999 || '減少量(固定値)は999以下として下さい。',
    ];
    watch(currentParams, async () => {
        const validResult = await form.value.validate();
        if (validResult.valid) {
            props.params.encroachment = currentParams.encroachment;
            props.params.lois = currentParams.lois;
            props.params.elois = currentParams.elois;
            props.params.dice = currentParams.dice;
            props.params.value = currentParams.value;
            props.params.dlois = currentParams.dlois;
        }
    });

</script>

<template>
    <v-form ref="form" class="pa-1">
        <v-row dense class="pt-2 ma-0">
            <v-col md="3" cols="6"><v-text-field label="現在侵蝕率" suffix="%" type="number" v-model.number="currentParams.encroachment" :rules="encroachmentRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col md="3" cols="6"><v-text-field label="残存ロイス数" type="number" min=0 max=7 v-model.number="currentParams.lois" :rules="loisRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col md="3" cols="6"><v-text-field label="Eロイス数" type="number" min=0 max=99 v-model.number="currentParams.elois" :rules="eloisRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"></v-text-field></v-col>
            <v-col md="3" cols="6" class="pb-2">
                <v-row dense>
                    <v-col cols="6" class="pr-0"><v-text-field label="その他減少量" suffix="D10+" type="number" min=0 max=99 v-model.number="currentParams.dice" :rules="diceRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                    <v-col cols="6" class="pl-0"><v-text-field type="number" min=0 max=999 v-model.number="currentParams.value" :rules="valueRule" variant="underlined" hide-details="auto" density="compact" class="pa-0 ma-0 text-md-body-1 text-caption"/></v-col>
                </v-row>
            </v-col>
        </v-row>
        <v-row dense class="pt-2 ma-0">
            <v-select label="バックトラックに影響するDロイス" v-model="currentParams.dlois" :items="dloisItem" variant="underlined" hide-details="auto" density="compact"/>
        </v-row>
    </v-form>
</template>