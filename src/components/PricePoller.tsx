"use client";

/**
 * PricePoller — layout.tsx 루트에 삽입되는 투명 폴링 컴포넌트
 *
 * 역할
 *  1. 모든 관심 종목 심볼을 모아 /api/batch-prices 를 주기적으로 호출
 *  2. 응답 데이터를 Zustand priceStore 에 저장
 *  3. 렌더링 출력 없음 (null return)
 *
 * 폴링 주기
 *  - 장 중 (KST 09:00~15:30) : 5초
 *  - 프리/애프터 / 주말        : 60초 (불필요한 YF 호출 최소화)
 */

import { useEffect, useCallback } from "react";
import { usePriceStore, PriceEntry } from "@/stores/priceStore";
import { KOSPI_SYMBOLS, KOSDAQ_SYMBOLS } from "@/lib/stockList";
import { SECTOR_STOCKS } from "@/lib/sectorStocks";

// ── 기본 감시 목록 (모든 페이지가 공유하는 종목들) ────────────────────────────
const BASE_SYMBOLS: string[] = [
  ...KOSPI_SYMBOLS,
  ...KOSDAQ_SYMBOLS,
  // 섹터 스톡에서 추출
  ...Object.values(SECTOR_STOCKS)
    .flat()
    .map((s) => {
      // Yahoo Finance sym (e.g. "005930.KS") → 그대로 사용
      // KS suffix → .KS, KQ suffix → .KQ 로 이미 되어있음
      return s.sym;
    }),
  // 미국 주요 종목
  "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META",
].filter((v, i, a) => a.indexOf(v) === i); // 중복 제거

/** KST 기준 장 중 여부 */
function isMarketOpen(): boolean {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();           // 0=일, 6=토
  if (day === 0 || day === 6) return false;
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  const minutes = h * 60 + m;
  return minutes >= 9 * 60 && minutes < 15 * 60 + 30;
}

const BATCH_SIZE = 50; // YF 안정 상한

export default function PricePoller() {
  const { addWatch, watchSymbols, setPrices, setLastPollAt } = usePriceStore();

  // 초기화: 기본 심볼 등록
  useEffect(() => {
    addWatch(BASE_SYMBOLS);
  }, [addWatch]);

  const poll = useCallback(async () => {
    const syms = Array.from(watchSymbols);
    if (syms.length === 0) return;

    // 50개씩 배치 분할
    const batches: string[][] = [];
    for (let i = 0; i < syms.length; i += BATCH_SIZE) {
      batches.push(syms.slice(i, i + BATCH_SIZE));
    }

    const allUpdates: Record<string, PriceEntry> = {};
    const now = Date.now();

    await Promise.allSettled(
      batches.map(async (batch) => {
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
        } catch {
          /* silent */
        }
      })
    );

    if (Object.keys(allUpdates).length > 0) {
      setPrices(allUpdates);
      setLastPollAt(now);
    }
  }, [watchSymbols, setPrices, setLastPollAt]);

  useEffect(() => {
    // 최초 즉시 실행
    poll();

    let tid: ReturnType<typeof setTimeout>;

    function schedule() {
      const delay = isMarketOpen() ? 5_000 : 60_000;
      tid = setTimeout(() => {
        poll();
        schedule();
      }, delay);
    }

    schedule();
    return () => clearTimeout(tid);
  }, [poll]);

  return null;
}
