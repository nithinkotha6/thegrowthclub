import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'The Growth Club',
  description: 'Train together. Compete together. Grow together.',
  openGraph: {
    title: 'The Growth Club',
    description: 'Train together. Compete together. Grow together.',
    images: ['/logo.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Growth Club',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full font-[family-name:var(--font-geist-sans)] bg-[#F7F8FA]">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}

