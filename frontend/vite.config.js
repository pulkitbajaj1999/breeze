// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: env.BASE_PATH || '/',
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      }
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  }
})