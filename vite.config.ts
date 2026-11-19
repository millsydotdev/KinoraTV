import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_NAME__: JSON.stringify(packageJson.name),
  },
  // Tauri's devUrl points at localhost:5199. Bind to '::' (dual-stack) so both IPv6 localhost (::1) and IPv4 (127.0.0.1) connect reliably in WebKitGTK.
  server: { host: '::', port: 5199, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  // Keep Rust compiler output visible when running under `tauri dev`.
  clearScreen: false,
  // Small font subsets would otherwise be inlined as data: URLs, which the Tauri CSP (font-src 'self') blocks.
  build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) },
})
