<script setup>

    import { computed } from 'vue'
    import { getFinalEncroachmentTableRows } from './ChartSetter'

    const props = defineProps({
        finalEncroachment: {
            type: Object,
            required: true,
        },
        mode: {
            type: String,
            required: true,
        },
    })

    const rows = computed(() => getFinalEncroachmentTableRows(
        props.finalEncroachment,
        props.mode,
    ))

</script>

<template>
    <table class="text-caption w-100" :aria-label="`最終侵蝕率分布 ${props.mode}`">
        <caption class="text-left">確率の数値</caption>
        <thead>
            <tr>
                <th scope="col">区分</th>
                <th scope="col" class="text-right">確率</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="row in rows" :key="row.label">
                <th scope="row" class="font-weight-regular text-left">{{ row.label }}</th>
                <td class="text-right">{{ row.probability }}%</td>
            </tr>
        </tbody>
    </table>
</template>
