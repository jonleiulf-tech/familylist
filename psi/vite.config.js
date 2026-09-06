import { readFileSync } from 'node:fs';
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

/* Service workeren legges ut som /sw.js med byggmerket satt inn. Den har
   verken import eller export, så den trenger ingen bunting – bare én
   utbytting. At fila blir ulik for hver utrulling er poenget: det er
   endringen i innhold nettleseren ser etter når den skal oppdage at en
   ny versjon finnes. */
function serviceworker() {
  return {
    name: 'psi-serviceworker',
    generateBundle() {
      const kilde = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: kilde.replaceAll('__BUILD_ID__', BYGG) });
    },
  };
}

export default defineConfig({
  plugins: [react(), byggmerke(), serviceworker()],
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
