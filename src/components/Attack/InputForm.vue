<script setup>

    import { getChartColor } from '@/data/ColorSetter';
    import { createCanonicalComboDataState } from '@/application/AttackCanonicalState';
    import ComboForm from './ComboForm.vue';
    import { mdiChevronUp,mdiChevronDown,mdiContentCopy,mdiDelete,mdiPlus } from '@mdi/js'

    const props = defineProps(['attackData']);
    let nextComboId = props.attackData.combos.reduce(
        (maximum, combo) => Math.max(maximum, combo.id),
        -1
    ) + 1;
    const allocateComboId = () => {
        const id = nextComboId;
        nextComboId += 1;
        return id;
    };
    const removeCombo = (index) => {
        props.attackData.combos.splice(index,1);
    };
    const duplicateCombo = (index) => {
        const nextId = allocateComboId();
        const source = props.attackData.combos[index];
        const initialShowDetails = {
            action: {value:source.showDetails.action.value},
            reaction: {value:source.showDetails.reaction.value},
        };
        const initialParams = {
            action: {
                score: {dice:source.data.params.action.score.dice, critical:source.data.params.action.score.critical, skill:source.data.params.action.score.skill, yousei:source.data.params.action.score.yousei, shihai:source.data.params.action.score.shihai},
                damage: {dice:source.data.params.action.damage.dice, value:source.data.params.action.damage.value, kazanari:source.data.params.action.damage.kazanari},
            },
            reaction: {
                mode: source.data.params.reaction.mode,
                score: {dice:source.data.params.reaction.score.dice, critical:source.data.params.reaction.score.critical, skill:source.data.params.reaction.score.skill, yousei:source.data.params.reaction.score.yousei, shihai:source.data.params.reaction.score.shihai},
                damage: {dice:source.data.params.reaction.damage.dice, value:source.data.params.reaction.damage.value},
            }
        };
        const newCombo = {
            id: nextId,
            name: source.name+'のコピー',
            show: true,
            showDetails: initialShowDetails,
            data: {
                params: initialParams,
                ...createCanonicalComboDataState(),
            },
        };
        props.attackData.combos.push(newCombo);
    };
    const addCombo = () => {
        const nextId = allocateComboId();
        const initialShowDetails = {
            action: {value:false},
            reaction: {value:false},
        };
        const initialParams = {
            action: {
                score: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
                damage: {dice:0, value:0, kazanari:0},
            },
            reaction: {
                mode: 'ドッジ',
                score: {dice:1, critical:10, skill:0, yousei:0, shihai:0},
                damage: {dice:0, value:0},
            }
        };
        const newCombo = {
            id: nextId,
            name: 'コンボ'+String(nextId+1),
            show: true,
            showDetails: initialShowDetails,
            data: {
                params: initialParams,
                ...createCanonicalComboDataState(),
            },
        };
        props.attackData.combos.push(newCombo);
    };
    const onShowDetails = (combo, {side, value}) => {
        if (side !== 'action' && side !== 'reaction') {
            return;
        }
        combo.showDetails[side].value = value;
    };
</script>

<template>
    <template v-for="(combo,index) in props.attackData.combos" :key="combo.id">
        <v-container class="pa-4">
            <v-row class="ma-0">
                <v-col sm="9" cols="7" class="pl-0 pr-3 pb-0"><v-text-field label="コンボ名" v-model="combo.name" variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption"></v-text-field></v-col>
                <v-col sm="3" cols="5" class="px-0">
                    <v-row class="ma-0">
                        <v-col cols="4" align-self="center" class="px-1 py-0">
                            <v-btn v-if="combo.show" variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="combo.show=false"><v-icon color="white" :icon="mdiChevronUp" /><span class="hidden-sm-and-down" style="color:white">畳む</span></v-btn>
                            <v-btn v-else variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="combo.show=true"><v-icon color="white" :icon="mdiChevronDown"/><span class="hidden-sm-and-down" style="color:white">開く</span></v-btn>
                        </v-col>
                        <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="duplicateCombo(index)"><v-icon color="white" :icon="mdiContentCopy"/><span class="hidden-sm-and-down" style="color:white">複製</span></v-btn></v-col>
                        <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="removeCombo(index)"><v-icon color="white" :icon="mdiDelete"/><span class="hidden-sm-and-down" style="color:white">削除</span></v-btn></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <ComboForm
                v-if="combo.show"
                :comboData="combo.data"
                :comboColor=getChartColor(combo.id)
                :showDetails="combo.showDetails"
                @show-details="(change) => onShowDetails(combo, change)"
            />
        </v-container>
        <v-divider class="mx-8"/>
    </template>
    <v-container class="px-3 py-1">
        <v-btn variant="flat" block @click="addCombo" class="text-md-body-1 text-caption"><v-icon :icon="mdiPlus"/>コンボを追加</v-btn>
    </v-container>
</template>
