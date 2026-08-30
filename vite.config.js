import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // To sider: forsiden (statisk) på /, selve appen på /app/.
  appType: 'mpa',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
      output: {
        // Rammeverk og Supabase i egne filer: de endres sjelden, så
        // nettleseren beholder dem i cache mellom utrullinger — bare
        // selve appkoden lastes på nytt.
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
