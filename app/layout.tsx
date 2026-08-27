import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Mono, DM_Sans, Pinyon_Script } from "next/font/google";
import "./globals.css";

// DESIGN.md (root) §3: Cormorant Garamond headings, DM Sans body, DM Mono counters/timers.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-dm-mono",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

// Luxury Analog accent: handwriting script for greetings (DESIGN.md §3 extension).
const pinyon = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-pinyon",
});

export const metadata: Metadata = {
  title: "QR Guest Photo & Voicebook",
  description: "Guest photo and voice guestbook",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${dmSans.variable} ${dmMono.variable} ${pinyon.variable}`}
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
