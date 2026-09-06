import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ProsjektFlyt',
  description: 'Enkel, rask og visuelt oversiktlig prosjektkoordinering',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
