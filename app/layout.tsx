import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SGS Rank Tracker",
  description: "Keyword rankings and visitors for every site",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
