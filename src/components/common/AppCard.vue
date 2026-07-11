<script setup>
    defineProps({
        title: { type: String, default: '' },
        icon: { type: [String, Object], default: null }, // MDIのパス(Object)も文字列も許容
    });
</script>

<template>
    <v-card class="ma-0">
        <template v-if="title || icon">
            <v-card-title class="d-flex align-center">
                <v-icon v-if="icon" :icon="icon" class="mr-2" />
                {{ title }}
            </v-card-title>
            <v-divider class="mx-2" />
        </template>

        <v-card-text class="pa-0 text-md-body-1 text-caption">
            <v-container class="pa-4">
                <slot />
            </v-container>
        </v-card-text>
    </v-card>
</template>