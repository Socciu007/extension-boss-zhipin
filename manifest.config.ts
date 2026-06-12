import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  icons: {
    48: 'public/logo.png',
  },
  action: {
    default_icon: {
      48: 'public/logo.png',
    },
    default_popup: 'src/popup/index.html',
  },
  permissions: [
    'contentSettings',
    'activeTab',
    'scripting',
    'storage',
    'tabs',
    'cookies',
    'alarms',
  ],
  // Content script only needs to run on the BOSS chat page. API calls
  // (Gemini) are made from the service worker, so no extra host perms there.
  host_permissions: [
    'https://generativelanguage.googleapis.com/*',
    'https://*.zhipin.com/*',
    'http://ai.dadaex.cn/*',
    'https://ai.dadaex.cn/*',
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/features/auto-reply/index.ts'],
      matches: ['https://*.zhipin.com/web/chat/*'],
      run_at: 'document_idle',
    },
  ],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
})
