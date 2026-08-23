<script setup>

    import {
        replaceAttackSideSnapshot,
    } from '@/application/AttackInputSnapshot';
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps(['comboData','comboColor','showDetails']);
    const emit = defineEmits(['show-details']);
    const onSideValidated = (side, snapshot) => {
        replaceAttackSideSnapshot(props.comboData.params, side, snapshot);
    };
    const onShowDetails = (side, value) => {
        emit('show-details', {side, value});
    };

</script>

<template>
    <AttackForm
        :params="comboData.params.action"
        :comboColor="comboColor"
        :showDetails="showDetails.action"
        @validated="(snapshot) => onSideValidated('action', snapshot)"
        @show-details="(value) => onShowDetails('action', value)"
    />
    <DefenceForm
        :params="comboData.params.reaction"
        :comboColor="comboColor"
        :showDetails="showDetails.reaction"
        @validated="(snapshot) => onSideValidated('reaction', snapshot)"
        @show-details="(value) => onShowDetails('reaction', value)"
    />
</template>
