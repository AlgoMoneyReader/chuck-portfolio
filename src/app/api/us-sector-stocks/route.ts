import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── SPDR ETF 주요 구성 종목 (시가총액 상위 10개, 2025년 기준) ─────────────────
// Yahoo Finance POST 스크리너가 Vercel 서버에서 차단되므로
// 하드코딩된 구성 종목 + 실시간 시세(v7/finance/quote) 방식으로 구현
const ETF_HOLDINGS: Record<string, { ticker: string; name: string }[]> = {
  XLK: [
    { ticker: "MSFT",  name: "Microsoft"      },
    { ticker: "AAPL",  name: "Apple"          },
    { ticker: "NVDA",  name: "NVIDIA"         },
    { ticker: "AVGO",  name: "Broadcom"       },
    { ticker: "ORCL",  name: "Oracle"         },
    { ticker: "AMD",   name: "AMD"            },
    { ticker: "QCOM",  name: "Qualcomm"       },
    { ticker: "AMAT",  name: "Applied Materials" },
    { ticker: "TXN",   name: "Texas Instruments" },
    { ticker: "CSCO",  name: "Cisco"          },
  ],
  XLC: [
    { ticker: "META",  name: "Meta"           },
    { ticker: "GOOGL", name: "Alphabet (A)"   },
    { ticker: "NFLX",  name: "Netflix"        },
    { ticker: "DIS",   name: "Disney"         },
    { ticker: "CMCSA", name: "Comcast"        },
    { ticker: "T",     name: "AT&T"           },
    { ticker: "VZ",    name: "Verizon"        },
    { ticker: "TMUS",  name: "T-Mobile"       },
    { ticker: "EA",    name: "Electronic Arts" },
    { ticker: "WBD",   name: "Warner Bros."   },
  ],
  XLY: [
    { ticker: "AMZN",  name: "Amazon"         },
    { ticker: "TSLA",  name: "Tesla"          },
    { ticker: "HD",    name: "Home Depot"     },
    { ticker: "MCD",   name: "McDonald's"     },
    { ticker: "NKE",   name: "Nike"           },
    { ticker: "LOW",   name: "Lowe's"         },
    { ticker: "SBUX",  name: "Starbucks"      },
    { ticker: "TJX",   name: "TJX Companies"  },
    { ticker: "BKNG",  name: "Booking Holdings" },
    { ticker: "CMG",   name: "Chipotle"       },
  ],
  XLF: [
    { ticker: "BRK-B", name: "Berkshire Hathaway" },
    { ticker: "JPM",   name: "JPMorgan Chase" },
    { ticker: "V",     name: "Visa"           },
    { ticker: "MA",    name: "Mastercard"     },
    { ticker: "BAC",   name: "Bank of America" },
    { ticker: "WFC",   name: "Wells Fargo"    },
    { ticker: "GS",    name: "Goldman Sachs"  },
    { ticker: "MS",    name: "Morgan Stanley" },
    { ticker: "AXP",   name: "American Express" },
    { ticker: "BLK",   name: "BlackRock"      },
  ],
  XLI: [
    { ticker: "GE",    name: "GE Aerospace"   },
    { ticker: "RTX",   name: "RTX Corp"       },
    { ticker: "CAT",   name: "Caterpillar"    },
    { ticker: "HON",   name: "Honeywell"      },
    { ticker: "UNP",   name: "Union Pacific"  },
    { ticker: "LMT",   name: "Lockheed Martin" },
    { ticker: "DE",    name: "Deere & Co"     },
    { ticker: "BA",    name: "Boeing"         },
    { ticker: "ETN",   name: "Eaton"          },
    { ticker: "UPS",   name: "UPS"            },
  ],
  XLV: [
    { ticker: "LLY",   name: "Eli Lilly"      },
    { ticker: "UNH",   name: "UnitedHealth"   },
    { ticker: "JNJ",   name: "Johnson & Johnson" },
    { ticker: "ABBV",  name: "AbbVie"         },
    { ticker: "MRK",   name: "Merck"          },
    { ticker: "TMO",   name: "Thermo Fisher"  },
    { ticker: "ABT",   name: "Abbott Labs"    },
    { ticker: "DHR",   name: "Danaher"        },
    { ticker: "AMGN",  name: "Amgen"          },
    { ticker: "BMY",   name: "Bristol-Myers"  },
  ],
  XLE: [
    { ticker: "XOM",   name: "ExxonMobil"     },
    { ticker: "CVX",   name: "Chevron"        },
    { ticker: "COP",   name: "ConocoPhillips" },
    { ticker: "EOG",   name: "EOG Resources"  },
    { ticker: "SLB",   name: "SLB"            },
    { ticker: "MPC",   name: "Marathon Petroleum" },
    { ticker: "PSX",   name: "Phillips 66"    },
    { ticker: "VLO",   name: "Valero Energy"  },
    { ticker: "OXY",   name: "Occidental"     },
    { ticker: "HES",   name: "Hess"           },
  ],
  XLB: [
    { ticker: "LIN",   name: "Linde"          },
    { ticker: "APD",   name: "Air Products"   },
    { ticker: "SHW",   name: "Sherwin-Williams" },
    { ticker: "FCX",   name: "Freeport-McMoRan" },
    { ticker: "NUE",   name: "Nucor"          },
    { ticker: "NEM",   name: "Newmont"        },
    { ticker: "DOW",   name: "Dow Inc."       },
    { ticker: "PPG",   name: "PPG Industries" },
    { ticker: "ALB",   name: "Albemarle"      },
    { ticker: "VMC",   name: "Vulcan Materials" },
  ],
  XLP: [
    { ticker: "PG",    name: "Procter & Gamble" },
    { ticker: "COST",  name: "Costco"         },
    { ticker: "KO",    name: "Coca-Cola"      },
    { ticker: "PEP",   name: "PepsiCo"        },
    { ticker: "WMT",   name: "Walmart"        },
    { ticker: "PM",    name: "Philip Morris"  },
    { ticker: "MO",    name: "Altria"         },
    { ticker: "MDLZ",  name: "Mondelez"       },
    { ticker: "CL",    name: "Colgate-Palmolive" },
    { ticker: "STZ",   name: "Constellation Brands" },
  ],
  XLU: [
    { ticker: "NEE",   name: "NextEra Energy" },
    { ticker: "DUK",   name: "Duke Energy"    },
    { ticker: "SO",    name: "Southern Company" },
    { ticker: "AEP",   name: "AEP"            },
    { ticker: "SRE",   name: "Sempra"         },
    { ticker: "EXC",   name: "Exelon"         },
    { ticker: "D",     name: "Dominion Energy" },
    { ticker: "XEL",   name: "Xcel Energy"    },
    { ticker: "PCG",   name: "PG&E"           },
    { ticker: "ED",    name: "Con Edison"     },
  ],
  XLRE: [
    { ticker: "PLD",   name: "Prologis"       },
    { ticker: "AMT",   name: "American Tower" },
    { ticker: "EQIX",  name: "Equinix"        },
    { ticker: "WELL",  name: "Welltower"      },
    { ticker: "PSA",   name: "Public Storage" },
    { ticker: "DLR",   name: "Digital Realty" },
    { ticker: "SPG",   name: "Simon Property" },
    { ticker: "O",     name: "Realty Income"  },
    { ticker: "VICI",  name: "VICI Properties" },
    { ticker: "EQR",   name: "Equity Residential" },
  ],
};

const ETF_SECTOR_KR: Record<string, string> = {
  XLK: "기술", XLC: "통신", XLY: "임의소비재", XLF: "금융", XLI: "산업재",
  XLV: "헬스케어", XLE: "에너지", XLB: "소재", XLP: "필수소비재",
  XLU: "유틸리티", XLRE: "부동산",
};

export interface USSectorStock {
  rank: number; code: string; name: string;
  price: number; changePct: number; volume: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const etf = (searchParams.get("etf") ?? "").toUpperCase();

  const holdings = ETF_HOLDINGS[etf];
  if (!holdings) {
    return NextResponse.json({ error: "Unknown ETF", etf }, { status: 400 });
  }

  const tickers = holdings.map(h => h.ticker);
  const nameMap  = Object.fromEntries(holdings.map(h => [h.ticker, h.name]));

  try {
    // v7/finance/quote — 배치 실시간 시세 (pre/post 포함)
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers.join(","))}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,shortName`,
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
      }
    );

    if (!res.ok) throw new Error(`quote fetch failed: ${res.status}`);

    const j = await res.json();
    const quotes = (j?.quoteResponse?.result ?? []) as Record<string, unknown>[];

    // 순서 유지: holdings 순서(시가총액 기준) 그대로 반환
    const stocks: USSectorStock[] = holdings.map((h, i) => {
      const q = quotes.find(r => (r.symbol as string) === h.ticker);
      return {
        rank:      i + 1,
        code:      h.ticker,
        name:      nameMap[h.ticker] ?? h.ticker,
        price:     q ? parseFloat(((q.regularMarketPrice as number) ?? 0).toFixed(2)) : 0,
        changePct: q ? parseFloat(((q.regularMarketChangePercent as number) ?? 0).toFixed(2)) : 0,
        volume:    q ? (q.regularMarketVolume as number) ?? 0 : 0,
      };
    });

    return NextResponse.json(
      { stocks, etf, sector: ETF_SECTOR_KR[etf] ?? etf, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
