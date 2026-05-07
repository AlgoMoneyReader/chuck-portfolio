"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "◈" },
  { href: "/portfolio", label: "포트폴리오", icon: "◉" },
  { href: "/analyze", label: "종목 분석", icon: "◎" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-navy-sub/90 backdrop-blur-md border-b border-navy-border">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-gold font-mono font-bold text-sm tracking-widest">알읽남</span>
          <span className="text-gray-500 text-xs hidden sm:block">Investment Dashboard</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-gold/15 text-gold border border-gold/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-navy-card"
                }`}
              >
                <span className="text-xs">{item.icon}</span>
                <span className="hidden sm:block">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
          <span className="text-xs text-gray-500 hidden sm:block">실시간</span>
        </div>
      </div>
    </nav>
  );
}
