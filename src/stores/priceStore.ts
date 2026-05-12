/**
 * Global real-time price store (Zustand)
 *
 * 단일 진실 원천(SSOT) — 모든 컴포넌트가 여기서 가격을 읽는다.
 * PricePoller (layout에 삽입) 가 5초마다 배치 업데이트한다.
 * key = Yahoo Finance symbol  (예: "005930.KS", "NVDA")
 */

import { create } from "zustand";

export interface PriceEntry {
  price: number;
  changePct: number;
  volume: number;
  updatedAt: number;   // Date.now()
}

interface PriceStore {
  prices: Record<string, PriceEntry>;
  /** 심볼 배열을 감시 목록에 추가 (중복 자동 제거) */
  watchSymbols: Set<string>;
  addWatch: (syms: string[]) => void;
  /** PricePoller 가 배치 응답으로 업데이트 */
  setPrices: (updates: Record<string, PriceEntry>) => void;
  lastPollAt: number;
  setLastPollAt: (ts: number) => void;
}

export const usePriceStore = create<PriceStore>((set) => ({
  prices: {},
  watchSymbols: new Set<string>(),

  addWatch: (syms) =>
    set((state) => {
      const next = new Set(state.watchSymbols);
      syms.forEach((s) => next.add(s));
      return { watchSymbols: next };
    }),

  setPrices: (updates) =>
    set((state) => ({
      prices: { ...state.prices, ...updates },
    })),

  lastPollAt: 0,
  setLastPollAt: (ts) => set({ lastPollAt: ts }),
}));
