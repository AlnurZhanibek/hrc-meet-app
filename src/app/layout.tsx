import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import Script from 'next/script';

export const metadata = { title: 'Jitsi Classroom' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider defaultColorScheme="dark">{children}</MantineProvider>

        {/* Load lib-jitsi-meet in the browser */}
        <Script src="https://meet.jit.si/libs/lib-jitsi-meet.min.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
