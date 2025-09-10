import Script from 'next/script';
import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { CounterStoreProvider } from '@/providers/counter-store-provider';

export const metadata = {
  title: 'My Mantine app',
  description: 'I have followed setup instructions carefully'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider>
          <CounterStoreProvider>{children}</CounterStoreProvider>
        </MantineProvider>
        <Script
          src="https://8x8.vc/libs/lib-jitsi-meet.min.js"
          strategy="beforeInteractive"
        ></Script>
      </body>
    </html>
  );
}
