import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Signals | Pregame Odds Monitor",
  description: "Monitor pregame Premier League, La Liga, Champions League, NFL, and MLB odds and signals.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
