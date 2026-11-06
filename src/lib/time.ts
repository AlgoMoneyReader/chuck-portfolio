export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}시간 전`;
  if (mins < 60 * 24 * 7) return `${Math.floor(mins / 1440)}일 전`;
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000); // 한국 날짜 기준
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}
