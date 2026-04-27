import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import Link from "next/link";
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
        <nav className="global-navbar">
          <div className="nav-container">
            <div className="nav-logo">FairLens</div>
            <div className="nav-links">
              <Link href="/">Home</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
