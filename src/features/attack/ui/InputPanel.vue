<script setup>

    import InputForm from './InputForm.vue';
    import { mdiTuneVariant } from '@mdi/js'

    const props = defineProps({
        combos: {
            type: Array,
            required: true,
        },
    });
    const emit = defineEmits([
        'combo-add',
        'combo-duplicate',
        'combo-remove',
        'combo-name-changed',
        'combo-visibility-changed',
        'combo-details-changed',
        'combo-side-validated',
    ]);

</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiTuneVariant"/> 判定条件</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <InputForm
                :combos="props.combos"
                @combo-add="() => emit('combo-add')"
                @combo-duplicate="(id) => emit('combo-duplicate', id)"
                @combo-remove="(id) => emit('combo-remove', id)"
                @combo-name-changed="(change) => emit('combo-name-changed', change)"
                @combo-visibility-changed="(change) => emit('combo-visibility-changed', change)"
                @combo-details-changed="(change) => emit('combo-details-changed', change)"
                @combo-side-validated="(change) => emit('combo-side-validated', change)"
            />
        </v-card-text>
    </v-card>
</template>
