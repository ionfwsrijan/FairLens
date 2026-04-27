"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavShell() {
  const pathname = usePathname();

  if (pathname?.startsWith("/dashboard")) {
    return null;
  }

  return (
    <nav className="global-navbar">
      <div className="nav-container">
        <div className="nav-logo">FairLens</div>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </div>
    </nav>
  );
}
