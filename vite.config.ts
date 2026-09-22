import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildTime = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),
    {
      // Emits a tiny, never-cached manifest the client polls to detect a new
      // deployment (see src/hooks/useVersionCheck.ts) — separate from the
      // hashed JS bundles so checking for updates never redownloads the app.
      name: 'write-version-manifest',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildTime }) })
      },
    },
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
})
