import type { Metadata, Viewport } from 'next';

import '@/styles/globals.scss';

import { Providers } from '@/providers/Providers';
import { APP_CONFIG } from '@/lib/config/app';

export const metadata: Metadata = {
  title: { default: APP_CONFIG.name, template: `%s · ${APP_CONFIG.name}` },
  description: 'Multi-tenant school operating system.',
  applicationName: APP_CONFIG.name,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://rsms.me/"
        />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('schoolos.theme') || 'system';
                  var resolved = t === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : t;
                  document.documentElement.setAttribute('data-theme', resolved);
                  document.documentElement.setAttribute('data-bs-theme', resolved);
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
