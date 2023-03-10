<script setup>

    const props = defineProps(['attackData'])

</script>

<template>
    <v-table>
        <thead>
            <tr>
                <th class="pa-0" style="font-size:80%"></th>
                <th class="text-right pa-0" style="font-size:80%">達成値期待値</th>
                <th class="text-right pa-0" style="font-size:80%">命中率</th>
                <th class="text-right pa-0" style="font-size:80%">ダメージ期待値</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="combo in props.attackData.combos" :key="combo.id">
                <td class="pa-0" style="font-size:80%">{{ combo.name }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ combo.data.scoreSummary.action.expectedValue }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ combo.data.scoreSummary.action.successRate }}%</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ combo.data.damageSummary.expectedValue }}</td>
            </tr>
            <tr v-if="props.attackData.combos.length>1">
                <td class="pa-0" style="font-size:80%">合計</td>
                <td class="pa-0 text-right" style="font-size:80%"></td>
                <td class="pa-0 text-right" style="font-size:80%"></td>
                <td class="pa-0 text-right" style="font-size:80%">{{ attackData.totalDamageSummary.expectedValue }}</td>
            </tr>
        </tbody>
    </v-table>
</template>