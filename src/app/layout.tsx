import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bedrock Panel',
  description: 'Minecraft Bedrock Dedicated Server Manager',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
