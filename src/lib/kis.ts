import { getKisToken } from "@/lib/fetchKisMaster";

export async function kisGet(path: string, trId: string, params: Record<string, string>) {
  const token = await getKisToken();
  const res = await fetch(`https://openapi.koreainvestment.com:9443${path}?${new URLSearchParams(params)}`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: trId,
      custtype: "P",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!j || j.rt_cd !== "0") throw new Error(`${trId} ${j?.msg_cd ?? res.status} ${(j?.msg1 ?? "").trim()}`);
  return j;
}

export const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? null : n;
};

export function kstYmd(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
}
