import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // React i egen fil: endres sjelden, så nettleseren beholder den i
          // cache mellom utrullinger. qrcode lastes dynamisk kun der QR vises.
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
  test: { environment: 'node' },
});
