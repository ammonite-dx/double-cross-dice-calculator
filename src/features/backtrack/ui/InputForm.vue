<script setup>

    import BacktrackForm from './BacktrackForm.vue';

    const props = defineProps(['params']);
    const emit = defineEmits(['validated']);
    const onValidated = (params) => {
        emit('validated', params);
    };

</script>

<template>
    <v-container class="pa-0">
        <BacktrackForm :params="props.params" @validated="onValidated"/>
    </v-container>
</template>
