import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH lets this deploy either at a domain root or under a GitHub Pages
// project path like https://username.github.io/rk-app-store/.
// Set it via the BASE_PATH env var in the deploy workflow; defaults to '/'.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json. tsconfig only affects
    // type-checking — without this, Vite itself can't resolve any of the
    // "@/..." imports used throughout src/, and the build fails.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
})
