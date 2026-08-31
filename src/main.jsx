import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './styles/tokens.css';
import './styles/components.css';
import App from './App.jsx';

// «Installer app»-hendelsen fyres av nettleseren FØR React er montert, så
// vi fanger den her og varsler appen. Uten dette går tilbudet tapt.
window.__plInstallEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();               // vi viser vårt eget kort i stedet
  window.__plInstallEvent = e;
  window.dispatchEvent(new Event('pl-installable'));
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);

// Service worker: gjør appen installerbar og lar handlelisten åpne uten
// dekning (bufret skall + siste kjente varer). Kun i produksjon — i dev
// ville den kranglet med Vites hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/app/' }).catch(() => {});
  });
}
