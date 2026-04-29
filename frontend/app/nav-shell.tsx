"use client";

import Link from "next/link";

export function NavShell() {
  return (
    <nav className="global-navbar">
      <div className="nav-container">
        <div className="nav-logo">FairLens</div>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/report/latest">Report</Link>
        </div>
      </div>
    </nav>
  );
}
