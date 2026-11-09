import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '../components/Providers';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans'
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono'
});

export const metadata: Metadata = {
  title: 'PROOFLINE — PayPal Dispute Investigation & Evidence Provenance',
  description:
    'Evidence you can trace. Disputes you can defend. Verifiable PayPal dispute investigation and evidence preparation for independent merchants.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-[#F7F6F2] text-[#14181F] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

