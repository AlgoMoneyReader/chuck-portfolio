"use client";

import { useState } from "react";
import PortfolioManager from "@/components/PortfolioManager";
import WatchlistPanel from "@/components/WatchlistPanel";
import RequireLogin from "@/components/RequireLogin";

export default function PortfolioPage() {
  const [tab, setTab] = useState<"hold" | "watch">("hold");
  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">My 포트폴리오</h1>
        <p className="text-sm text-gray-400 mt-1">내 보유 종목 손익과 관심 종목을 한곳에서</p>
      </div>
      <RequireLogin title="My 포트폴리오는 로그인 후 이용할 수 있습니다">
        <div className="grid grid-cols-2 max-w-sm rounded-xl bg-navy-card border border-navy-border p-1 text-sm font-semibold">
          {([["hold", "보유 종목"], ["watch", "관심 종목"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`py-2 rounded-lg ${tab === k ? "bg-navy-sub text-white" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-4">{tab === "hold" ? <PortfolioManager /> : <WatchlistPanel />}</div>
      </RequireLogin>
    </main>
  );
}
