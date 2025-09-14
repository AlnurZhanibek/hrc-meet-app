import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { JitsiStoreProvider } from '@/providers/jitsi-store-provider';
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mantine-color-scheme="light">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider defaultColorScheme="light">
          <JitsiStoreProvider>{children}</JitsiStoreProvider>
        </MantineProvider>

        {/* Load lib-jitsi-meet in the browser */}
        <Script src="https://meet.jit.si/libs/lib-jitsi-meet.min.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
