import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UBot Core',
  description: 'Agent Core System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}