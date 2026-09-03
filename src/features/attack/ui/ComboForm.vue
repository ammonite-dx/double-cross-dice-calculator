<script setup>
    import AttackForm from './AttackForm.vue';
    import DefenceForm from './DefenceForm.vue';

    const props = defineProps({
        params: {
            type: Object,
            required: true,
        },
        comboColor: {
            type: String,
            required: true,
        },
        showDetails: {
            type: Object,
            required: true,
        },
    });
    const emit = defineEmits(['side-validated', 'show-details']);
    const onSideValidated = (side, snapshot) => {
        emit('side-validated', {side, snapshot});
    };
    const onShowDetails = (side, value) => {
        emit('show-details', {side, value});
    };

</script>

<template>
    <AttackForm
        :params="props.params.action"
        :comboColor="props.comboColor"
        :showDetails="props.showDetails.action"
        @validated="(snapshot) => onSideValidated('action', snapshot)"
        @show-details="(value) => onShowDetails('action', value)"
    />
    <DefenceForm
        :params="props.params.reaction"
        :comboColor="props.comboColor"
        :showDetails="props.showDetails.reaction"
        @validated="(snapshot) => onSideValidated('reaction', snapshot)"
        @show-details="(value) => onShowDetails('reaction', value)"
    />
</template>

