"use client";

import type { MarketPulse as MarketPulseType } from "@/types/portfolio";
import { formatPct, formatChange } from "@/lib/formatters";

interface MarketPulseProps {
  data: MarketPulseType;
}

interface MarketItemProps {
  label: string;
  value: string;
  change?: string;
  changePct?: number;
  unit?: string;
  special?: boolean;
}

function MarketItem({ label, value, change, changePct, unit, special }: MarketItemProps) {
  const isPositive = (changePct ?? 0) >= 0;
  const changeColor = isPositive ? "text-signal-green" : "text-signal-red";

  return (
    <div className="card flex-1 min-w-0">
      <p className="card-title mb-2">{label}</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1">
          <span className={`text-xl md:text-2xl font-bold num ${special ? "text-cyan-brand" : "text-white"}`}>
            {value}
          </span>
          {unit && <span className="text-xs text-gray-500">{unit}</span>}
        </div>
        {change !== undefined && changePct !== undefined && (
          <div className={`flex items-center gap-1 ${changeColor}`}>
            <span className="text-xs num">{change}</span>
            <span className="text-xs num">({formatPct(changePct)})</span>
          </div>
        )}
        {change !== undefined && changePct === undefined && (
          <div className={`text-xs num ${(parseFloat(change) ?? 0) >= 0 ? "text-signal-green" : "text-signal-red"}`}>
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketPulse({ data }: MarketPulseProps) {
  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">Market Pulse</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MarketItem
          label="KOSPI"
          value={data.kospi.value.toLocaleString("ko-KR")}
          change={formatChange(data.kospi.change)}
          changePct={data.kospi.changePct}
        />
        <MarketItem
          label="KOSDAQ"
          value={data.kosdaq.value.toLocaleString("ko-KR")}
          change={formatChange(data.kosdaq.change)}
          changePct={data.kosdaq.changePct}
        />
        <MarketItem
          label="USD/KRW"
          value={data.usdKrw.value.toLocaleString("ko-KR")}
          unit="원"
          change={formatChange(data.usdKrw.change)}
          changePct={data.usdKrw.changePct}
        />
        <MarketItem
          label="반도체 시총비중"
          value={data.semiWeight.value.toFixed(2)}
          unit="%"
          change={`${data.semiWeight.change >= 0 ? "+" : ""}${data.semiWeight.change.toFixed(2)}%p`}
          special
        />
      </div>
    </section>
  );
}
