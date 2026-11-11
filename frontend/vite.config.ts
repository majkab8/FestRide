import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // source maps for the production bundle (readable stack traces, Lighthouse "valid source maps")
  build: { sourcemap: true },
})
