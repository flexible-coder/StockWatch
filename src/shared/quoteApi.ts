export interface MarketQuote {
  secid: string;
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  percent: number | null;
  volume: number | null;
  amount: number | null;
  marketValue: number | null;
  timestamp: number | null;
}

type EastMoneyQuoteRow = {
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f5?: number | string;
  f6?: number | string;
  f12?: number | string;
  f13?: number | string;
  f14?: number | string;
  f20?: number | string;
  f124?: number | string;
};

type EastMoneyQuotePayload = {
  data?: {
    diff?: EastMoneyQuoteRow[] | Record<string, EastMoneyQuoteRow>;
  };
};

const QUOTE_API_URL = "https://push2.eastmoney.com/api/qt/ulist.np/get";

const toNumber = (value: unknown): number | null => {
  if (value === "-" || value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getQuoteRows = (payload: EastMoneyQuotePayload): EastMoneyQuoteRow[] => {
  const diff = payload.data?.diff;
  if (!diff) return [];
  return Array.isArray(diff) ? diff : Object.values(diff);
};

const normalizeQuoteRow = (row: EastMoneyQuoteRow): MarketQuote | null => {
  const code = String(row.f12 ?? "").trim();
  const market = String(row.f13 ?? "").trim();
  if (!code || !market) return null;

  return {
    secid: `${market}.${code}`,
    code,
    name: String(row.f14 ?? code).trim(),
    price: toNumber(row.f2),
    change: toNumber(row.f4),
    percent: toNumber(row.f3),
    volume: toNumber(row.f5),
    amount: toNumber(row.f6),
    marketValue: toNumber(row.f20),
    timestamp: toNumber(row.f124),
  };
};

export const fetchMarketQuotes = async (
  secids: string[],
  signal?: AbortSignal,
): Promise<MarketQuote[]> => {
  const uniqueSecids = Array.from(new Set(secids.filter(Boolean)));
  if (uniqueSecids.length === 0) return [];

  const query = new URLSearchParams({
    fltt: "2",
    invt: "2",
    fields: "f2,f3,f4,f5,f6,f12,f13,f14,f20,f124",
    secids: uniqueSecids.join(","),
  });

  const response = await fetch(`${QUOTE_API_URL}?${query.toString()}`, {
    headers: { "Cache-Control": "no-cache" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Quote request failed: ${response.status}`);
  }

  const payload = (await response.json()) as EastMoneyQuotePayload;
  return getQuoteRows(payload)
    .map(normalizeQuoteRow)
    .filter((quote): quote is MarketQuote => !!quote);
};
