import type { MetadataRoute } from 'next';

/** Gjør ComPro installerbar («Legg til på hjemskjerm») på mobil og desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ComPro – communication and projects',
    short_name: 'ComPro',
    description: 'Enkel, rask og oversiktlig prosjektkoordinering.',
    start_url: '/prosjekter',
    display: 'standalone',
    background_color: '#f5f6f8',
    theme_color: '#1d1d1b',
    lang: 'nb',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
