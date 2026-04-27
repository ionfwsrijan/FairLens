import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { NavShell } from "./nav-shell";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

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
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        <NavShell />
        {children}
      </body>
    </html>
  );
}
