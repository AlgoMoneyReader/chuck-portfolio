"use client";

interface FinalVerdictProps {
  summary: string;
  badges: { label: string; color: string }[];
}

const BADGE_STYLES: Record<string, string> = {
  green: "bg-signal-green/20 text-signal-green border-signal-green/40",
  amber: "bg-signal-amber/20 text-signal-amber border-signal-amber/40",
  red:   "bg-signal-red/20   text-signal-red   border-signal-red/40",
  cyan:  "bg-cyan-brand/20   text-cyan-brand   border-cyan-brand/40",
  gold:  "bg-gold/20         text-gold         border-gold/40",
  blue:  "bg-signal-blue/20  text-signal-blue  border-signal-blue/40",
};

export default function FinalVerdict({ summary, badges }: FinalVerdictProps) {
  return (
    <section>
      <h2 className="card-title text-gray-500 mb-3">Final Verdict</h2>
      <div className="card border-gold/30 bg-gradient-to-r from-gold/5 to-navy-card">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="text-base md:text-lg font-semibold text-white leading-relaxed">
              {summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border whitespace-nowrap ${
                  BADGE_STYLES[badge.color] ?? BADGE_STYLES.blue
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
