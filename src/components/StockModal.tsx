"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const StockView = lazy(() => import("./StockView"));

export interface StockTarget { code: string; market?: "KS" | "KQ" | "US"; name?: string }

const Ctx = createContext<(t: StockTarget) => void>(() => {});
/** 종목 팝업 열기: const openStock = useStockModal(); openStock({ code, market, name }) */
export const useStockModal = () => useContext(Ctx);

/**
 * 종목 상세 팝업 — PC 는 가운데 창, 모바일은 아래에서 올라오는 시트.
 * 바깥(어두운 곳) 클릭·ESC·뒤로가기로 닫히고, 보던 화면은 그대로 남는다.
 */
export function StockModalProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<StockTarget | null>(null);
  const pushed = useRef(false);

  const open = useCallback((t: StockTarget) => {
    setTarget(t);
    // 뒤로가기로 닫히도록 기록 하나를 쌓는다 (Next 라우터 상태는 그대로 유지)
    if (!pushed.current) {
      window.history.pushState({ ...(window.history.state ?? {}), stockModal: 1 }, "");
      pushed.current = true;
    }
  }, []);

  const close = useCallback(() => {
    if (pushed.current) { pushed.current = false; window.history.back(); }
    setTarget(null);
  }, []);

  useEffect(() => {
    const onPop = () => { if (pushed.current) { pushed.current = false; setTarget(null); } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [target, close]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {target && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center animate-fade-in" onClick={close}>
          <div className="w-full sm:max-w-3xl h-[92dvh] sm:h-[88vh] bg-navy border border-navy-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-y-auto overscroll-contain animate-slide-up sm:animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <Suspense fallback={<div className="p-6 space-y-3">{[0, 1, 2].map(i => <div key={i} className="card h-32 animate-pulse" />)}</div>}>
              <StockView key={target.code} code={target.code} market={target.market} name={target.name} modal onClose={close} />
            </Suspense>
          </div>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

/** 종목 링크: 그냥 누르면 팝업, 새 탭(Ctrl/⌘·가운데 클릭)은 전체 화면 페이지 */
export function StockLink({ code, market, name, className, children }: StockTarget & { className?: string; children: React.ReactNode }) {
  const open = useStockModal();
  return (
    <a href={`/stock/${code}`} className={className}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        open({ code, market, name });
      }}>
      {children}
    </a>
  );
}
