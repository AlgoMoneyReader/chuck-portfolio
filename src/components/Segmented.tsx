"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// URL 쿼리에 저장되는 탭 상태 (뒤로가기·공유 링크에도 유지)
export function useQueryTab<T extends string>(key: string, options: readonly T[], fallback: T): [T, (v: T) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname() ?? "/";
  const raw = sp?.get(key) as T | null;
  const value = raw && options.includes(raw) ? raw : fallback;
  const set = (v: T) => {
    const q = new URLSearchParams(sp?.toString() ?? "");
    q.set(key, v);
    router.replace(`${path}?${q.toString()}`, { scroll: false });
  };
  return [value, set];
}

// 큰 탭(국내/미국)
export function RegionTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className={`grid ${items.length === 3 ? "grid-cols-3" : "grid-cols-2"} rounded-xl bg-navy-card border border-navy-border p-1 text-sm font-bold`}>
      {items.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`py-2 rounded-lg transition-colors ${value === k ? "bg-navy-sub text-white" : "text-gray-500"}`}>{l}</button>
      ))}
    </div>
  );
}

// 작은 알약 토글
// fill: 휴대폰에서도 한 줄에 다 들어가게 칸을 똑같이 나누고 글자·여백을 줄인다 (항목이 많을 때)
export function Pills<T extends string>({ value, onChange, items, fill = false }: { value: T; onChange: (v: T) => void; items: [T, string][]; fill?: boolean }) {
  return (
    <div className={`flex ${fill ? "gap-1" : "gap-1.5 overflow-x-auto scrollbar-none"}`}>
      {items.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`${fill ? "flex-1 min-w-0 px-1 py-1.5 text-xs sm:text-sm sm:flex-none sm:px-4 whitespace-nowrap" : "shrink-0 px-4 py-1.5 text-sm"} rounded-full font-semibold ${value === k ? "bg-white text-navy" : "bg-navy-card text-gray-400 border border-navy-border"}`}>{l}</button>
      ))}
    </div>
  );
}
