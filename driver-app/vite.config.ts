import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre 6 loads its renderer worker from a separate file; pre-bundling breaks that path and leaves the map blank.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
