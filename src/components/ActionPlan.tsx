"use client";

import type { Action, ActionPriority } from "@/types/portfolio";
import { formatKRW, formatUSD } from "@/lib/formatters";

interface ActionPlanProps {
  actions: Action[];
}

const PRIORITY_CONFIG: Record<ActionPriority, { label: string; badgeClass: string; borderColor: string; bgColor: string; icon: string }> = {
  urgent:      { label: "긴급", badgeClass: "badge-urgent",      borderColor: "border-signal-red/40",   bgColor: "bg-signal-red/5",   icon: "🔴" },
  recommended: { label: "추천", badgeClass: "badge-recommended", borderColor: "border-signal-amber/40", bgColor: "bg-signal-amber/5", icon: "🟡" },
  watch:       { label: "관망", badgeClass: "badge-watch",       borderColor: "border-cyan-brand/40",   bgColor: "bg-cyan-brand/5",   icon: "🔵" },
  hold:        { label: "보유", badgeClass: "badge-hold",        borderColor: "border-gray-500/40",     bgColor: "bg-gray-500/5",     icon: "⚪" },
};

const PRIORITY_ORDER: ActionPriority[] = ["urgent", "recommended", "watch", "hold"];

export default function ActionPlan({ actions }: ActionPlanProps) {
  const grouped = PRIORITY_ORDER.reduce(
    (acc, p) => ({ ...acc, [p]: actions.filter((a) => a.priority === p) }),
    {} as Record<ActionPriority, Action[]>
  );

  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">Action Plan</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PRIORITY_ORDER.map((priority) => {
          const cfg = PRIORITY_CONFIG[priority];
          const items = grouped[priority];
          if (!items.length) return null;

          return (
            <div key={priority} className={`card border ${cfg.borderColor} ${cfg.bgColor}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">{cfg.icon}</span>
                <span className={cfg.badgeClass}>{cfg.label}</span>
                <span className="text-xs text-gray-500 num">{items.length}건</span>
              </div>
              <div className="space-y-3">
                {items.map((action) => (
                  <div key={action.id} className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white leading-tight">{action.title}</p>
                      {action.ticker && (
                        <span className="text-[10px] bg-navy-border px-1.5 py-0.5 rounded num text-gray-300 shrink-0">
                          {action.ticker}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{action.description}</p>
                    {action.amount !== undefined && (
                      <p className={`text-xs num font-bold mt-0.5 ${
                        priority === "urgent" ? "text-signal-red" : "text-signal-amber"
                      }`}>
                        {action.amount > 1000
                          ? formatKRW(action.amount)
                          : formatUSD(action.amount)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
