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
  content_scripts: [
    {
      js: ['src/content/main.ts'],
      matches: [
        'http://localhost:*/*', 
        'https://localhost:*/*', 
        'http://127.0.0.1:*/*', 
        'https://127.0.0.1:*/*',
        'http://0.0.0.0:*/*',
        'https://0.0.0.0:*/*'
      ],
      exclude_matches: [],
      // matches: ['https://*/*'],
      // exclude_matches: ['http://127.0.0.1/*'],
    },
  ],
  permissions: ['sidePanel', 'contentSettings', 'storage'],
  host_permissions: [
    'http://push2.eastmoney.com/*',
    'https://push2.eastmoney.com/*',
    'https://searchapi.eastmoney.com/*',
  ],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Ctrl+Shift+Y',
        mac: 'Command+Shift+Y',
      },
      description: '打开插件弹窗或侧边栏',
    },
    toggle_feature: {
      suggested_key: {
        default: 'Ctrl+Shift+Z',
        mac: 'Command+Shift+Z',
      },
      description: '切换网页悬浮窗显示状态',
    },
  },
})
