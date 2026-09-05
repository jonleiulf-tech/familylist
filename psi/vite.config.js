import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildId, buildTime } from './scripts/buildinfo.mjs';

const BYGG = buildId();
const TID = buildTime();

// Legger byggmerket i kildekoden også, så det går an å se hvilken commit som
// er ute uten å kjøre JavaScript: «Vis kilde» → <meta name="psi-build">.
function byggmerke() {
  return {
    name: 'psi-byggmerke',
    transformIndexHtml(html) {
      return html.replace('</head>', `<meta name="psi-build" content="${BYGG} ${TID} UTC">\n</head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), byggmerke()],
  define: {
    __BUILD_ID__: JSON.stringify(BYGG),
    __BUILD_TIME__: JSON.stringify(TID),
  },
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
