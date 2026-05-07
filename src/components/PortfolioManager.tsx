"use client";

import { useEffect, useState, useCallback } from "react";

interface Holding {
  id?: string;
  ticker: string;
  name: string;
  qty: number;
  avg_price: number;
  currency: "KRW" | "USD";
  sector: string;
  // live data
  currentPrice?: number;
  changePct?: number;
  profitLoss?: number;
  profitLossPct?: number;
  evalAmount?: number;
}

const SECTORS = ["반도체", "AI·테크", "금융", "바이오", "방산", "에너지", "통신", "건설", "자동차", "ETF", "기타"];
const STORAGE_KEY = "alilnam_portfolio";

function loadFromStorage(): Holding[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToStorage(holdings: Holding[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

function krwFormat(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
function usdFormat(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PortfolioManager() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<Omit<Holding, "id">>({
    ticker: "",
    name: "",
    qty: 0,
    avg_price: 0,
    currency: "KRW",
    sector: "기타",
  });

  // Load from localStorage on mount
  useEffect(() => {
    setHoldings(loadFromStorage());
  }, []);

  const refreshPrices = useCallback(async (list: Holding[]) => {
    if (list.length === 0) return list;
    setLoading(true);
    try {
      const tickers = list.map((h) => h.ticker).join(",");
      const res = await fetch(`/api/stock?tickers=${encodeURIComponent(tickers)}`);
      if (!res.ok) return list;
      const json = await res.json();
      const updated = list.map((h) => {
        const live = json.data?.[h.ticker];
        if (!live) return h;
        const evalAmt = live.price * h.qty;
        const costBasis = h.avg_price * h.qty;
        const pl = evalAmt - costBasis;
        const plPct = (pl / costBasis) * 100;
        return {
          ...h,
          currentPrice: live.price,
          changePct: live.changePct,
          profitLoss: pl,
          profitLossPct: plPct,
          evalAmount: evalAmt,
        };
      });
      return updated;
    } catch {
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAndRefresh = useCallback(async () => {
    const stored = loadFromStorage();
    const updated = await refreshPrices(stored);
    setHoldings(updated);
    saveToStorage(updated.map(({ currentPrice, changePct, profitLoss, profitLossPct, evalAmount, ...rest }) => { void currentPrice; void changePct; void profitLoss; void profitLossPct; void evalAmount; return rest; }));
  }, [refreshPrices]);

  useEffect(() => {
    loadAndRefresh();
    const iv = setInterval(loadAndRefresh, 60_000);
    return () => clearInterval(iv);
  }, [loadAndRefresh]);

  function openAdd() {
    setEditTarget(null);
    setForm({ ticker: "", name: "", qty: 0, avg_price: 0, currency: "KRW", sector: "기타" });
    setShowForm(true);
  }

  function openEdit(h: Holding) {
    setEditTarget(h);
    setForm({ ticker: h.ticker, name: h.name, qty: h.qty, avg_price: h.avg_price, currency: h.currency, sector: h.sector });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.ticker || !form.qty || !form.avg_price) return;
    const ticker = form.ticker.toUpperCase();
    let updated: Holding[];
    if (editTarget) {
      updated = holdings.map((h) => h.ticker === editTarget.ticker ? { ...h, ...form, ticker } : h);
    } else {
      if (holdings.find((h) => h.ticker === ticker)) {
        alert("이미 등록된 종목입니다. 수정 버튼을 사용하세요.");
        return;
      }
      updated = [...holdings, { ...form, ticker, id: crypto.randomUUID() }];
    }
    const refreshed = await refreshPrices(updated);
    setHoldings(refreshed);
    saveToStorage(refreshed.map(({ currentPrice, changePct, profitLoss, profitLossPct, evalAmount, ...rest }) => { void currentPrice; void changePct; void profitLoss; void profitLossPct; void evalAmount; return rest; }));
    setShowForm(false);
  }

  function handleDelete(ticker: string) {
    if (!confirm(`${ticker}를 삭제하시겠습니까?`)) return;
    const updated = holdings.filter((h) => h.ticker !== ticker);
    setHoldings(updated);
    saveToStorage(updated);
  }

  // Summary
  const totalEval = holdings.reduce((s, h) => s + (h.evalAmount ?? h.qty * h.avg_price), 0);
  const totalCost = holdings.reduce((s, h) => s + h.qty * h.avg_price, 0);
  const totalPL = totalEval - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "총 평가금", value: krwFormat(Math.round(totalEval)), color: "text-white" },
          { label: "총 투자원금", value: krwFormat(Math.round(totalCost)), color: "text-gray-300" },
          { label: "평가손익", value: (totalPL >= 0 ? "+" : "") + krwFormat(Math.round(totalPL)), color: totalPL >= 0 ? "text-signal-green" : "text-signal-red" },
          { label: "수익률", value: (totalPLPct >= 0 ? "+" : "") + totalPLPct.toFixed(2) + "%", color: totalPLPct >= 0 ? "text-signal-green" : "text-signal-red" },
        ].map((s) => (
          <div key={s.label} className="card">
            <p className="card-title">{s.label}</p>
            <p className={`num text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Header + Add Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          보유 종목 <span className="text-gray-500">({holdings.length})</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={loadAndRefresh} disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-400 border border-navy-border rounded-lg hover:border-cyan-brand hover:text-cyan-brand transition-all">
            {loading ? "갱신 중..." : "↻ 새로고침"}
          </button>
          <button onClick={openAdd}
            className="px-3 py-1.5 text-xs font-medium text-navy bg-gold rounded-lg hover:bg-gold-light transition-all">
            + 종목 추가
          </button>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-border text-xs text-gray-500">
              {["종목", "섹터", "수량", "평단가", "현재가", "일간", "평가금액", "손익", "수익률", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-600 text-sm">
                  아직 등록된 종목이 없습니다.<br />
                  <span className="text-gold cursor-pointer" onClick={openAdd}>+ 종목 추가</span>하여 포트폴리오를 구성하세요.
                </td>
              </tr>
            )}
            {holdings.map((h) => {
              const isPos = (h.profitLossPct ?? 0) >= 0;
              const dayPos = (h.changePct ?? 0) >= 0;
              const fmt = h.currency === "KRW" ? krwFormat : usdFormat;
              return (
                <tr key={h.ticker} className="border-b border-navy-border/50 hover:bg-navy-card/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{h.name || h.ticker}</p>
                      <p className="text-xs text-gray-500 num">{h.ticker}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 bg-navy-sub border border-navy-border rounded-full text-gray-400">{h.sector}</span>
                  </td>
                  <td className="px-4 py-3 num text-gray-300">{h.qty.toLocaleString()}</td>
                  <td className="px-4 py-3 num text-gray-400">{fmt(h.avg_price)}</td>
                  <td className="px-4 py-3 num font-medium text-white">
                    {h.currentPrice ? fmt(h.currentPrice) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-4 py-3 num text-sm ${dayPos ? "text-signal-green" : "text-signal-red"}`}>
                    {h.changePct != null ? `${dayPos ? "+" : ""}${h.changePct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 num text-gray-200">
                    {h.evalAmount ? fmt(h.evalAmount) : fmt(h.qty * h.avg_price)}
                  </td>
                  <td className={`px-4 py-3 num ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                    {h.profitLoss != null ? `${isPos ? "+" : ""}${fmt(h.profitLoss)}` : "—"}
                  </td>
                  <td className={`px-4 py-3 num font-bold ${isPos ? "text-signal-green" : "text-signal-red"}`}>
                    {h.profitLossPct != null ? `${isPos ? "+" : ""}${h.profitLossPct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(h)} className="text-xs text-gray-500 hover:text-cyan-brand transition-colors">수정</button>
                      <button onClick={() => handleDelete(h.ticker)} className="text-xs text-gray-500 hover:text-signal-red transition-colors">삭제</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-navy-card border border-navy-border rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-bold text-white">{editTarget ? "종목 수정" : "종목 추가"}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">티커 (국내: 6자리 숫자, 해외: 영문)</label>
                <input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  placeholder="005930 또는 AAPL" disabled={!!editTarget}
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none disabled:opacity-50" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">종목명</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="삼성전자"
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">수량</label>
                <input type="number" value={form.qty || ""} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  placeholder="100"
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">평단가</label>
                <input type="number" value={form.avg_price || ""} onChange={(e) => setForm({ ...form, avg_price: Number(e.target.value) })}
                  placeholder="175572"
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm num focus:border-gold outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">통화</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as "KRW" | "USD" })}
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none">
                  <option value="KRW">KRW (원화)</option>
                  <option value="USD">USD (달러)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">섹터</label>
                <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  className="w-full bg-navy-sub border border-navy-border rounded-lg px-3 py-2 text-white text-sm focus:border-gold outline-none">
                  {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="text-xs text-gray-600">
              * 국내주식: 티커에 6자리 숫자 입력 시 자동으로 .KS 처리됩니다
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2 border border-navy-border text-gray-400 rounded-lg text-sm hover:border-gray-500 transition-all">
                취소
              </button>
              <button onClick={handleSave}
                className="flex-1 py-2 bg-gold text-navy font-bold rounded-lg text-sm hover:bg-gold-light transition-all">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
