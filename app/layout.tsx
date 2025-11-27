import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, JetBrains_Mono, Quicksand, Fredoka, Oswald, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

// Neo-Cyber Theme Fonts
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
  preload: false, // Only preload active theme fonts
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

// Dreamcore Theme Fonts
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

// Editorial Theme Fonts
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "ARAGO LYRICS - K-Pop Romanización y Traducción",
  description: "Obtén romanización instantánea y traducciones al español e inglés de tus canciones favoritas de K-Pop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable} ${quicksand.variable} ${fredoka.variable} ${oswald.variable} ${playfair.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
