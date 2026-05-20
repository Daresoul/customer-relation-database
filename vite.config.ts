/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
      // Use polling instead of fsevents for compatibility
      usePolling: true,
      interval: 100,
    },
  },

  // Vitest configuration. jsdom gives us DOM globals (document, window) for
  // React Testing Library and useBarcodeScanner's keydown listener.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Exclude e2e tests — those run via Playwright, not Vitest.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/src-tauri/**'],
  },
})