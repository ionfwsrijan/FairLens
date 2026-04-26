import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FairLens",
  description: "Audit, explain, and mitigate unfair AI outcomes on real historical data."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
