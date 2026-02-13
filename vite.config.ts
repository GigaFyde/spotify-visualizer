import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        'cast-receiver': resolve(__dirname, 'client/cast-receiver.html'),
        sender: resolve(__dirname, 'client/sender.html'),
      },
    },
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
