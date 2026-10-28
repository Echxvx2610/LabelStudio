import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'src/renderer/index.html')
      }
    }
  },
  test: {
    root: '.',
    environment: 'node'
  }
});
