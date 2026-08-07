<script setup>
    import { onErrorCaptured,ref,watch } from 'vue';
    import { useRoute } from 'vue-router';

    const route = useRoute();
    const error = ref(null);

    onErrorCaptured((capturedError) => {
        error.value = capturedError;
        console.error('Failed to initialize calculation view', capturedError);
        return false;
    });
    watch(() => route.fullPath, () => {
        error.value = null;
    });
    const retry = () => {
        window.location.reload();
    };
</script>

<template>
    <slot v-if="error === null" />
    <v-container v-else class="pa-6">
        <v-alert type="error" title="計算データを読み込めませんでした">
            通信状態を確認して、もう一度お試しください。
            <template #append>
                <v-btn variant="outlined" @click="retry">再試行</v-btn>
            </template>
        </v-alert>
    </v-container>
</template>
