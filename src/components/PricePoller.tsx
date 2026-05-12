"use client";

/**
 * PricePoller — layout.tsx 루트 투명 폴링 컴포넌트
 *
 * 역할: /api/batch-prices 를 주기적으로 호출 → Zustand priceStore 업데이트
 * 폴링 주기: 장 중 5초 / 비장중 60초 (KST 09:00~15:30 기준 동적 판단)
 *
 * 감시 종목 = SECTOR_STOCKS(섹터 히트맵용) + 미국 주요 종목
 * ※ 하드코딩 배열(KOSPI_SYMBOLS 등) 의존 없음
 *    — SECTOR_STOCKS 는 섹터 히트맵 UI 기능 전용이며 검색 마스터와 무관
 */

import { useEffect, useCallback } from "react";
import { usePriceStore, PriceEntry } from "@/stores/priceStore";
import { SECTOR_STOCKS } from "@/lib/sectorStocks";

// 섹터 히트맵에 등장하는 종목들만 실시간 폴링 (검색과는 무관한 UI 목적)
const SECTOR_SYMS: string[] = Object.values(SECTOR_STOCKS)
  .flat()
  .map((s) => s.sym);

// 미국 주요 종목 (포트폴리오/해외주식 섹션용)
const US_SYMS = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META"];

const BASE_SYMBOLS = Array.from(new Set([...SECTOR_SYMS, ...US_SYMS]));

function isMarketOpen(): boolean {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return min >= 540 && min < 930; // 09:00~15:30
}

const BATCH = 50;

export default function PricePoller() {
  const { addWatch, watchSymbols, setPrices, setLastPollAt } = usePriceStore();

  useEffect(() => {
    addWatch(BASE_SYMBOLS);
  }, [addWatch]);

  const poll = useCallback(async () => {
    const syms = Array.from(watchSymbols);
    if (!syms.length) return;

    const allUpdates: Record<string, PriceEntry> = {};
    const now = Date.now();

    await Promise.allSettled(
      Array.from({ length: Math.ceil(syms.length / BATCH) }, (_, i) =>
        syms.slice(i * BATCH, (i + 1) * BATCH)
      ).map(async (batch) => {
        try {
          const res = await fetch(
            `/api/batch-prices?symbols=${encodeURIComponent(batch.join(","))}`,
            { cache: "no-store" }
          );
          if (!res.ok) return;
          const json = await res.json();
          for (const [sym, data] of Object.entries(
            json.prices as Record<string, { price: number; changePct: number; volume: number }>
          )) {
            allUpdates[sym] = { ...data, updatedAt: now };
          }
        } catch { /* silent */ }
      })
    );

    if (Object.keys(allUpdates).length > 0) {
      setPrices(allUpdates);
      setLastPollAt(now);
    }
  }, [watchSymbols, setPrices, setLastPollAt]);

  useEffect(() => {
    poll();
    let tid: ReturnType<typeof setTimeout>;
    function schedule() {
      tid = setTimeout(() => { poll(); schedule(); }, isMarketOpen() ? 5_000 : 60_000);
    }
    schedule();
    return () => clearTimeout(tid);
  }, [poll]);

  return null;
}
