<script setup>

    const props = defineProps(['checkData'])

</script>

<template>
    <v-table>
        <thead>
            <tr>
                <th class="pa-0" style="font-size:80%"></th>
                <th class="text-right pa-0" style="font-size:80%">達成値期待値</th>
                <th class="text-right pa-0" style="font-size:80%">成功率</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="pa-0" style="font-size:80%">アクション側</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ checkData.scoreSummary.action.expectedValue }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ checkData.scoreSummary.action.successRate }}%</td>
            </tr>
            <tr v-if="props.checkData.dfclty.opposed">
                <td class="pa-0" style="font-size:80%">リアクション側</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ checkData.scoreSummary.reaction.expectedValue }}</td>
                <td class="pa-0 text-right" style="font-size:80%">{{ checkData.scoreSummary.reaction.successRate }}%</td>
            </tr>
        </tbody>
    </v-table>
</template>