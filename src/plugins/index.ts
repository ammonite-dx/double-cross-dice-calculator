import type { App } from 'vue'

import { loadFonts } from './webfontloader'
import vuetify from './vuetify'
import router from '../router'

export function registerPlugins(app: App): void {
  loadFonts()
  app
    .use(vuetify)
    .use(router)
}
