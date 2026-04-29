import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discord Insight Platform",
  description: "Discord scraping, filtering, and ChatGPT prompt workflow dashboard"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
