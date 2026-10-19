import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildTime = new Date().toISOString()
// Vercel exposes the deployed commit at build time; empty on local builds.
declare const process: { env: Record<string, string | undefined> }
const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)

export default defineConfig({
  plugins: [
    react(),
    {
      // Emits a tiny, never-cached manifest the client polls to detect a new
      // deployment (see src/hooks/useVersionCheck.ts) — separate from the
      // hashed JS bundles so checking for updates never redownloads the app.
      name: 'write-version-manifest',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildTime }) })
      },
      // Every fresh visit (and every back/forward restore from the bfcache)
      // asks for the latest build before the app boots; a stale index.html
      // reloads straight into the new version. sessionStorage remembers the
      // build we reloaded for, so a CDN that still serves the old HTML can't
      // cause a reload loop.
      transformIndexHtml() {
        const B = JSON.stringify(buildTime)
        const code = `(function(){var B=${B},K='garage_reload_for';function c(){try{fetch('/version.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(!j||typeof j.buildTime!=='string'||j.buildTime===B)return;try{if(sessionStorage.getItem(K)===j.buildTime)return;sessionStorage.setItem(K,j.buildTime)}catch(e){}location.reload()}).catch(function(){})}catch(e){}}c();addEventListener('pageshow',function(e){if(e.persisted)c()})})();`
        return [{ tag: 'script', children: code, injectTo: 'head' }]
      },
    },
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
})
