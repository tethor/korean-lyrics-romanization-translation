import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "K-Lyric Neo — Romanización y Traducción de K-Pop",
  description:
    "Pega letras en coreano y obtén romanización instantánea + traducción a inglés y español. Herramienta gratuita para fans de K-Pop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <Script
        defer
        src="https://analytics.pocapay.com/script.js"
        data-website-id="19a93e7b-8035-47a8-86bc-c4c343129a6d"
      />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
