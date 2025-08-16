import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import sirv from 'sirv'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const LOG_DIR = path.resolve('./log')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    vueDevTools(),
    { name: 'serve-log', apply: 'serve', configureServer(server) {
      const serve = sirv(LOG_DIR, { dev: true, etag: true, maxAge: 0 })
      server.middlewares.use('/log', (req, res, next) => serve(req, res, next))
    } }
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url))
    },
  },

  server: { fs: { allow: [process.cwd(), LOG_DIR] } },
  base: './',
  build: {
    outDir: './dist/'
  }
})
