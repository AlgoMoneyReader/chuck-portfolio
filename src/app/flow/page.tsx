import { Suspense } from "react";
import FlowTabs from "@/components/FlowTabs";

export const metadata = { title: "매매동향 | 알읽남 - 증시 레이더" };

export default function FlowPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-5 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">매매동향</h1>
        <p className="text-xs text-gray-500 mt-0.5">AI 레이더 분석과 시장별 종목 흐름 · 섹터 흐름</p>
      </div>
      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <FlowTabs />
      </Suspense>
    </main>
  );
}
