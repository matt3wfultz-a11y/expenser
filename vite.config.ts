/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works at any GitHub Pages URL
  // (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
