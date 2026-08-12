import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}