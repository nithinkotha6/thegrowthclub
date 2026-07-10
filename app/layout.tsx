import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Growth Club — Dashboard",
  description: "Train together. Compete together. Grow together.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full font-[family-name:var(--font-geist-sans)] bg-[#F7F8FA]">
        {children}
      </body>
    </html>
  );
}
