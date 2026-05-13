#!/usr/bin/env python3
"""
KRX KIND에서 KOSPI+KOSDAQ 전종목 목록을 수집하여
src/data/stock_master.json 을 생성합니다.

실행: python3 scripts/generate-stock-master.py

필요 패키지: 없음 (표준 라이브러리만 사용)
실행 주기: 월 1회 또는 종목 변경 이슈 발생 시 실행 후 커밋
"""

import urllib.request, re, html, json, time, os, sys
from datetime import datetime

def fetch_kind(market_type: str, market_code: str, label: str) -> list:
    """KRX KIND 상장법인 목록 다운로드 (인증 불필요)"""
    url = (
        f"https://kind.krx.co.kr/corpgeneral/corpList.do"
        f"?method=download&searchType=13&marketType={market_type}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode("euc-kr", errors="replace")
    except Exception as e:
        print(f"  ❌ {label} fetch 실패: {e}", file=sys.stderr)
        return []

    stocks = []
    for row_m in re.finditer(r"<tr>(.*?)</tr>", raw, re.DOTALL):
        row = row_m.group(1)
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(tds) < 3:
            continue
        name     = html.unescape(re.sub(r"<[^>]+>", "", tds[0])).strip()
        code_raw = html.unescape(re.sub(r"<[^>]+>", "", tds[2])).strip()
        # 6자리 숫자 종목코드만 수집 (알파벳 포함 코드는 특수종목 — 제외)
        if name and re.match(r"^\d{6}$", code_raw):
            stocks.append({"code": code_raw, "name": name, "market": market_code})

    print(f"  ✅ {label}: {len(stocks)}개")
    return stocks


def classify_type(name: str) -> str:
    """종목명으로 타입 분류"""
    if re.search(
        r"ETF|인버스|레버리지|KODEX|TIGER|KBSTAR|ARIRANG|KOSEF|HANARO|SOL |ACE |TIMEFOLIO",
        name
    ):
        return "etf"
    if re.search(r"우[BC]?$", name):
        return "preferred"
    if re.search(r"SPAC|스팩", name):
        return "spac"
    return "regular"


def main():
    print("📥 KRX KIND 전종목 수집 시작...")

    kospi  = fetch_kind("stockMkt",  "KS", "KOSPI")
    time.sleep(0.5)
    kosdaq = fetch_kind("kosdaqMkt", "KQ", "KOSDAQ")

    # 중복 제거 및 타입 분류
    seen: set = set()
    all_stocks: list = []
    for s in kospi + kosdaq:
        if s["code"] not in seen:
            seen.add(s["code"])
            s["type"] = classify_type(s["name"])
            all_stocks.append(s)

    today = datetime.now().strftime("%Y-%m-%d")
    result = {
        "generated": today,
        "total": len(all_stocks),
        "stocks": all_stocks,
    }

    out_path = os.path.join(
        os.path.dirname(__file__), "..", "src", "data", "stock_master.json"
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) // 1024
    print(f"\n✅ 저장 완료: src/data/stock_master.json ({size_kb}KB, {len(all_stocks)}개)")
    print(f"   regular: {sum(1 for s in all_stocks if s['type']=='regular')}")
    print(f"   spac:    {sum(1 for s in all_stocks if s['type']=='spac')}")
    print(f"   preferred:{sum(1 for s in all_stocks if s['type']=='preferred')}")
    print()
    print("📌 다음 단계: git add src/data/stock_master.json && git commit && git push")


if __name__ == "__main__":
    main()
