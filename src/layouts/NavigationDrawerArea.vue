<template>
    <v-navigation-drawer app>
        <v-list nav>
            <v-list-item prepend-icon="mdi-home" title="ホーム" to="/"></v-list-item>
            <v-list-item prepend-icon="mdi-dice-multiple" title="一般判定" to="/check"></v-list-item>
            <v-list-item prepend-icon="mdi-sword-cross" title="攻撃" to="/attack"></v-list-item>
            <v-list-item prepend-icon="mdi-scale-unbalanced" title="バックトラック" to="/backtrack"></v-list-item>
        </v-list>
    </v-navigation-drawer>
</template>