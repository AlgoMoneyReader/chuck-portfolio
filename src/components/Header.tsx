"use client";

import { formatDate } from "@/lib/formatters";

interface HeaderProps {
  lastUpdated: string;
}

export default function Header({ lastUpdated }: HeaderProps) {
  return (
    <header className="border-b border-navy-border bg-navy-sub/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center">
            <span className="text-navy text-xs font-black">C</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">
              Chuck Portfolio
            </h1>
            <p className="text-[10px] text-gray-500 leading-tight">알읽남 · 개인 투자 대시보드</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-xs text-gray-500 num">
            {formatDate(lastUpdated)}
          </span>
          <div className="flex items-center gap-1.5 bg-signal-green/10 border border-signal-green/30 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
            <span className="text-[10px] text-signal-green font-medium">LIVE</span>
          </div>
        </div>
      </div>
    </header>
  );
}
