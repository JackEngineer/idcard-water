import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 1420, strictPort: true, proxy: {'/__verification': {target: 'http://127.0.0.1:1421', changeOrigin: true}} },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], restoreMocks: true },
  clearScreen: false,
});
