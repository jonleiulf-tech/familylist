import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ComPro',
    template: '%s · ComPro',
  },
  description: 'ComPro – communication and projects. Enkel, rask og visuelt oversiktlig prosjektkoordinering.',
  applicationName: 'ComPro',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#131722' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
