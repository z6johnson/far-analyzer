import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAR Clause Analyzer",
  description:
    "Decision-support tool for reviewing FAR/CAR/DFARS clauses in sponsor contracts.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
