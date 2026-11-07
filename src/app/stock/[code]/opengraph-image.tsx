import { renderStockCard, CARD_SIZE } from "@/lib/shareCard";

// /stock/005930 링크를 카톡·인스타로 보내면 그 종목의 시세 카드가 미리보기로 뜬다
export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "알읽남 증시 레이더 — 종목 시세";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { code: string } }) {
  return renderStockCard(decodeURIComponent(params.code));
}
