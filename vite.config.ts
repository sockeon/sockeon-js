import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Sockeon',
      formats: ['es', 'cjs'],
      fileName: (format) => {
        if (format === 'es') return 'sockeon-client.js';
        if (format === 'cjs') return 'sockeon-client.cjs';
        return `sockeon-client.${format}.js`;
      },
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
    sourcemap: true,
    minify: 'terser',
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
