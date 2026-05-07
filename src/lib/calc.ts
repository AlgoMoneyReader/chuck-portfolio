import type { DomesticHolding, OverseasHolding } from "@/types/portfolio";

export function calcProfitPct(avgPrice: number, currentPrice: number): number {
  return ((currentPrice - avgPrice) / avgPrice) * 100;
}

export function calcProfit(
  avgPrice: number,
  currentPrice: number,
  qty: number
): number {
  return (currentPrice - avgPrice) * qty;
}

export function calcCurrentValue(currentPrice: number, qty: number): number {
  return currentPrice * qty;
}

export function getHeatmapColor(profitPct: number): string {
  if (profitPct >= 100) return "#0D5C3A";
  if (profitPct >= 50) return "#1D9E75";
  if (profitPct >= 20) return "#2DC989";
  if (profitPct >= 10) return "#56D9A0";
  if (profitPct >= 0) return "#2A4A3A";
  if (profitPct >= -5) return "#4A2A2A";
  if (profitPct >= -10) return "#8B2020";
  return "#E24B4A";
}

export function getHeatmapTextColor(profitPct: number): string {
  return profitPct >= 0 ? "#A8F0D0" : "#FFB4B4";
}

export function calcDomesticHoldingValue(holding: DomesticHolding): number {
  return holding.currentPrice * holding.qty;
}

export function calcOverseasHoldingValueKRW(
  holding: OverseasHolding,
  rate: number
): number {
  return holding.currentPrice * holding.qty * rate;
}

export function calcPortfolioWeight(
  value: number,
  totalAsset: number
): number {
  return (value / totalAsset) * 100;
}
