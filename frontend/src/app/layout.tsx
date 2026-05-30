import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AlphaTrade AI',
  description: 'Next-Generation Quantitative Market Intelligence Terminal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}