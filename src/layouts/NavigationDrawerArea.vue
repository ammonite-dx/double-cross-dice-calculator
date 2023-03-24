<script setup>
    import { mdiHome,mdiDiceMultiple,mdiSwordCross,mdiScaleUnbalanced } from '@mdi/js'
</script>

<template>
    <v-navigation-drawer app>
        <v-list nav>
            <v-list-item :prepend-icon="mdiHome" title="ホーム" to="/"></v-list-item>
            <v-list-item :prepend-icon="mdiDiceMultiple" title="一般判定" to="/check"></v-list-item>
            <v-list-item :prepend-icon="mdiSwordCross" title="攻撃" to="/attack"></v-list-item>
            <v-list-item :prepend-icon="mdiScaleUnbalanced" title="バックトラック" to="/backtrack"></v-list-item>
        </v-list>
    </v-navigation-drawer>
</template>