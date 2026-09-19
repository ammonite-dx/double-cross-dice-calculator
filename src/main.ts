// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'
import { provideCalculationClient } from '@/plugins/calculationClient'

const app = createApp(App)

registerPlugins(app)
provideCalculationClient(app)

app.mount('#app')
