// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'
import {
  CALCULATION_CLIENT_KEY,
  calculationClient,
} from '@/runtime/CalculationClient'

const app = createApp(App)

registerPlugins(app)
app.provide(CALCULATION_CLIENT_KEY, calculationClient)

app.mount('#app')
