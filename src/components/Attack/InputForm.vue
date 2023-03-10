<script setup>

    import { watch } from 'vue';
    import { getScore,getScoreSummary,getDamage,getDamageSummary,getTotalDamage } from '@/data/Calculator';
    import { getChartColor } from '@/data/ColorSetter';
    import ComboForm from './ComboForm.vue';

    const props = defineProps(['attackData']);
    const removeCombo = (index) => {
        props.attackData.combos.splice(index,1);
    };
    const duplicateCombo = (index) => {
        var max = props.attackData.combos.reduce(function(a,b){
            return a > b.id ? a : b.id;
        },0);
        const nextId = max+1;
        const initialParams = {
            action: {
                score: {dice:props.attackData.combos[index].data.params.action.score.dice, critical:props.attackData.combos[index].data.params.action.score.critical, skill:props.attackData.combos[index].data.params.action.score.skill},
                damage: {dice:props.attackData.combos[index].data.params.action.damage.dice, value:props.attackData.combos[index].data.params.action.damage.value},
            },
            reaction: {
                mode: props.attackData.combos[index].data.params.reaction.mode,
                score: {dice:props.attackData.combos[index].data.params.reaction.score.dice, critical:props.attackData.combos[index].data.params.reaction.score.critical, skill:props.attackData.combos[index].data.params.reaction.score.skill},
                damage: {dice:props.attackData.combos[index].data.params.reaction.damage.dice, value:props.attackData.combos[index].data.params.reaction.damage.value},
            }
        };
        const initialScore = {
            action: {distribution:props.attackData.combos[index].data.score.action.distribution.slice(), upperTailProbability:props.attackData.combos[index].data.score.action.upperTailProbability.slice()},
            reaction: {distribution:props.attackData.combos[index].data.score.reaction.distribution.slice(), upperTailProbability:props.attackData.combos[index].data.score.reaction.upperTailProbability.slice()},
        };
        const initialScoreSummary = {
            action: {expectedValue:props.attackData.combos[index].data.scoreSummary.action.expectedValue, successRate: props.attackData.combos[index].data.scoreSummary.action.successRate},
            reaction: {expectedValue:props.attackData.combos[index].data.scoreSummary.reaction.expectedValue, successRate: props.attackData.combos[index].data.scoreSummary.reaction.successRate},
        };
        const initialDamage = {distribution:props.attackData.combos[index].data.damage.distribution, upperTailProbability:props.attackData.combos[index].data.damage.upperTailProbability};
        const initialDamageSummary = {expectedValue: props.attackData.combos[index].data.damageSummary.expectedValue};
        const newCombo = {
            id: nextId,
            name: props.attackData.combos[index].name+'のコピー',
            show: true,
            data: {
                params: initialParams,
                score: initialScore,
                scoreSummary: initialScoreSummary,
                damage: initialDamage,
                damageSummary: initialDamageSummary,
            },
        };
        props.attackData.combos.push(newCombo);
    };
    const addCombo = () => {
        var max = props.attackData.combos.reduce(function(a,b){
            return a > b.id ? a : b.id;
        },0);
        const nextId = max+1;
        const initialParams = {
            action: {
                score: {dice:1, critical:10, skill:0},
                damage: {dice:0, value:0},
            },
            reaction: {
                mode: 'ドッジ',
                score: {dice:1, critical:10, skill:0},
                damage: {dice:0, value:0},
            }
        };
        const initialScore = {
            action: getScore(initialParams.action.score),
            reaction: getScore(initialParams.reaction.score),
        };
        const initialScoreSummary = getScoreSummary(initialScore);
        const initialDamage = getDamage(initialScore,initialParams.action.damage,initialParams.reaction.damage);
        const initialDamageSummary = getDamageSummary(initialDamage);
        const newCombo = {
            id: nextId,
            name: 'コンボ'+String(nextId+1),
            show: true,
            data: {
                params: initialParams,
                score: initialScore,
                scoreSummary: initialScoreSummary,
                damage: initialDamage,
                damageSummary: initialDamageSummary,
            },
        };
        props.attackData.combos.push(newCombo);
    };
    watch(props.attackData.combos, () => {
        props.attackData.totalDamage = getTotalDamage(props.attackData.combos);
        props.attackData.totalDamageSummary = getDamageSummary(props.attackData.totalDamage);
    });

</script>

<template>
    <template v-for="(combo,index) in props.attackData.combos" :key="combo.id">
        <v-container class="pa-4">
            <v-row class="ma-0">
                <v-col sm="9" cols="7" class="pl-0 pr-3 pb-0"><v-text-field label="コンボ名" v-model="combo.name" variant="underlined" hide-details="auto" density="compact" class="text-md-body-1 text-caption"></v-text-field></v-col>
                <v-col sm="3" cols="5" class="px-0">
                    <v-row class="ma-0">
                        <v-col cols="4" align-self="center" class="px-1 py-0">
                            <v-btn v-if="combo.show" variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="combo.show=false"><v-icon color="white">mdi-chevron-up</v-icon><span class="hidden-sm-and-down" style="color:white">畳む</span></v-btn>
                            <v-btn v-else variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="combo.show=true"><v-icon color="white">mdi-chevron-down</v-icon><span class="hidden-sm-and-down" style="color:white">開く</span></v-btn>
                        </v-col>
                        <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="duplicateCombo(index)"><v-icon color="white">mdi-content-copy</v-icon><span class="hidden-sm-and-down" style="color:white">複製</span></v-btn></v-col>
                        <v-col cols="4" align-self="center" class="px-1 py-0"><v-btn variant="flat" block class="pa-0" :color=getChartColor(combo.id) @click="removeCombo(index)"><v-icon color="white">mdi-delete</v-icon><span class="hidden-sm-and-down" style="color:white">削除</span></v-btn></v-col>
                    </v-row>
                </v-col>
            </v-row>
            <ComboForm v-if="combo.show" :comboData="combo.data" :comboColor=getChartColor(combo.id) />
        </v-container>
        <v-divider class="mx-8"/>
    </template>
    <v-container class="px-3 py-1">
        <v-btn variant="flat" block @click="addCombo" class="text-md-body-1 text-caption"><v-icon>mdi-plus</v-icon>コンボを追加</v-btn>
    </v-container>
</template>