export interface MarketPulse {
  kospi: { value: number; change: number; changePct: number };
  kosdaq: { value: number; change: number; changePct: number };
  usdKrw: { value: number; change: number; changePct: number };
  semiWeight: { value: number; change: number };
}

export interface DomesticHolding {
  ticker: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  sector: string;
}

export interface OverseasHolding {
  ticker: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  currency: "USD";
  sector: string;
}

export type ActionPriority = "urgent" | "recommended" | "watch" | "hold";

export interface Action {
  id: string;
  priority: ActionPriority;
  title: string;
  description: string;
  ticker?: string;
  amount?: number;
}

export interface Milestone {
  id: string;
  label: string;
  date: string;
  amount: number;
  currency: "KRW" | "USD";
  status: "pending" | "completed" | "upcoming";
  note?: string;
}

export interface SellCandidate {
  ticker: string;
  name: string;
  qty: number;
  currentPrice: number;
  avgPrice: number;
  currency: "KRW" | "USD";
  profitPct: number;
  estimatedProceeds: number;
  priority: "high" | "medium" | "low";
  reason: string;
}

export interface RiaAllocation {
  name: string;
  ticker: string;
  pct: number;
  currentPrice: number;
  color: string;
  shares: number;
  amount: number;
}

export interface RiaStrategy {
  currentRiaKRW: number;
  note: string;
  conservative: { label: string; allocations: RiaAllocation[] };
  aggressive: { label: string; allocations: RiaAllocation[] };
}

export interface PortfolioData {
  lastUpdated: string;
  totalAsset: number;
  totalProfit: number;
  totalProfitPct: number;
  cashKRW: number;
  cashUSDBase: number;
  cashUSDRia: number;
  usdKrwRate: number;
  marketPulse: MarketPulse;
  domesticHoldings: DomesticHolding[];
  overseasHoldings: OverseasHolding[];
  milestones: Milestone[];
  actions: Action[];
  sellCandidates: SellCandidate[];
  riaStrategy: RiaStrategy;
  finalVerdict: {
    summary: string;
    badges: { label: string; color: string }[];
  };
}
