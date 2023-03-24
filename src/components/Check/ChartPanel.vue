<script setup>

    import { ref } from 'vue';
    import ScoreChart from './ScoreChart.vue';
    import SettingForm from './SettingForm.vue';
    import { mdiChartLine } from '@mdi/js'

    const props = defineProps(['checkData']);
    const setting = ref({min:0, max:30, mode:'達成値がXとなる確率を表示'});
    const settingUpdate = (newSetting) => {setting.value=newSetting};

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiChartLine"/> 達成値分布</v-card-title>
        <v-divider class="mx-2" />
        <v-container class="pa-0">
            <v-card-text class="text-md-body-1 text-caption">
                <ScoreChart :checkData="props.checkData" :setting="setting"/>
                <SettingForm @settingUpdate="settingUpdate($event)"/>
            </v-card-text>
        </v-container>
    </v-card>
</template>