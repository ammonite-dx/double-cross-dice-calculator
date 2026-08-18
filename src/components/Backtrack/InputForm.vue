<script setup>

    import BacktrackForm from './BacktrackForm.vue';

    const props = defineProps(['backtrackData']);
    const emit = defineEmits(['validated']);
    const onValidated = (params) => {
        emit('validated', params);
    };

</script>

<template>
    <v-container class="pa-0">
        <BacktrackForm :params="props.backtrackData.params" @validated="onValidated"/>
    </v-container>
</template>
