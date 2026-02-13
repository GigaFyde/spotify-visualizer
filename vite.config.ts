import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
      },
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
  assetsInclude: ['**/*.glsl'],
});
