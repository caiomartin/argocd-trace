import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';

export default defineConfig({
  plugins: [react({jsxRuntime: 'classic'})],
  build: {
    outDir: 'dist', emptyOutDir: true, cssCodeSplit: false,
    lib: {entry: resolve(import.meta.dirname, 'src/index.tsx'), name: 'ArgoCdTrace', formats: ['iife'], fileName: () => 'extension-trace.js'},
    rollupOptions: {external: ['react','react-dom'], output: {globals: {react:'React','react-dom':'ReactDOM'}}},
    minify: 'oxc', sourcemap: false, target: 'es2019'
  }
});
