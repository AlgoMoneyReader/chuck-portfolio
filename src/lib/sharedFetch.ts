// 같은 주소를 여러 컴포넌트가 몇 초 간격으로 부를 때(상단 티커 + 증시 카드 등) 요청을 하나로 합친다.
// maxAgeMs 안에 받은 응답(또는 진행 중인 요청)이 있으면 그것을 같이 쓴다.
const cache = new Map<string, { at: number; p: Promise<unknown> }>();

export function sharedJson<T = unknown>(url: string, maxAgeMs = 4_000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.p as Promise<T>;
  const p = fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  cache.set(url, { at: Date.now(), p });
  p.catch(() => { if (cache.get(url)?.p === p) cache.delete(url); });
  return p as Promise<T>;
}
