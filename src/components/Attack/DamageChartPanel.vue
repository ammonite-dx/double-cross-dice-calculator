<script setup>

    import { ref } from 'vue';
    import DamageChart from './DamageChart.vue';
    import DamageSettingForm from './DamageSettingForm.vue';

    const props = defineProps(['attackData']);
    const setting = ref({min:0, max:100, mode:'ダメージがXとなる確率を表示'});

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon>mdi-chart-line</v-icon> ダメージ分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <DamageChart :attackData="props.attackData" :setting="setting"/>
                <DamageSettingForm :setting="setting"/>
            </v-card-text>
        </v-container>
    </v-card>
</template>