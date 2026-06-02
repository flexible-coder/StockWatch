import { DEFAULT_STOCK_CONFIG } from "./stockConfig";
import type { StockSearchResult } from "./stockSearch";

export interface WatchlistStock {
  secid: string;
  code: string;
  name: string;
  note?: string;
  addedAt: number;
}

export const WATCHLIST_STORAGE_KEY = "tickeye.watchlist";

export const DEFAULT_WATCHLIST: WatchlistStock[] = [
  {
    secid: DEFAULT_STOCK_CONFIG.secid,
    code: DEFAULT_STOCK_CONFIG.code,
    name: DEFAULT_STOCK_CONFIG.name,
    addedAt: 1,
  },
  { secid: "0.300750", code: "300750", name: "宁德时代", addedAt: 2 },
  { secid: "1.601318", code: "601318", name: "中国平安", addedAt: 3 },
  { secid: "1.600036", code: "600036", name: "招商银行", addedAt: 4 },
  { secid: "0.002594", code: "002594", name: "比亚迪", addedAt: 5 },
  { secid: "116.00700", code: "00700", name: "腾讯控股", addedAt: 6 },
  { secid: "116.03690", code: "03690", name: "美团-W", addedAt: 7 },
  { secid: "116.09988", code: "09988", name: "阿里巴巴-W", addedAt: 8 },
];

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && !!chrome.storage?.sync;

const normalizeWatchlistStock = (
  value: Partial<WatchlistStock> | null | undefined,
): WatchlistStock | null => {
  if (!value) return null;

  const secid = typeof value.secid === "string" ? value.secid.trim() : "";
  const code = typeof value.code === "string" ? value.code.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!/^\d+\.[A-Za-z0-9]+$/.test(secid) || !code || !name) return null;

  return {
    secid,
    code,
    name,
    note:
      typeof value.note === "string" && value.note.trim()
        ? value.note.trim()
        : undefined,
    addedAt:
      typeof value.addedAt === "number" && Number.isFinite(value.addedAt)
        ? value.addedAt
        : Date.now(),
  };
};

export const normalizeWatchlist = (value: unknown): WatchlistStock[] => {
  if (!Array.isArray(value)) return [];

  const stockBySecid = new Map<string, WatchlistStock>();
  for (const item of value) {
    const stock = normalizeWatchlistStock(item as Partial<WatchlistStock>);
    if (!stock || stockBySecid.has(stock.secid)) continue;
    stockBySecid.set(stock.secid, stock);
  }

  return Array.from(stockBySecid.values()).sort(
    (left, right) => left.addedAt - right.addedAt,
  );
};

export const getWatchlist = async (): Promise<WatchlistStock[]> => {
  if (!hasChromeStorage()) return DEFAULT_WATCHLIST;

  const result = await chrome.storage.sync.get(WATCHLIST_STORAGE_KEY);
  const stored = result[WATCHLIST_STORAGE_KEY];
  if (stored === undefined) {
    await chrome.storage.sync.set({ [WATCHLIST_STORAGE_KEY]: DEFAULT_WATCHLIST });
    return DEFAULT_WATCHLIST;
  }

  return normalizeWatchlist(stored);
};

export const saveWatchlist = async (
  watchlist: WatchlistStock[],
): Promise<WatchlistStock[]> => {
  const normalized = normalizeWatchlist(watchlist);

  if (hasChromeStorage()) {
    await chrome.storage.sync.set({
      [WATCHLIST_STORAGE_KEY]: normalized,
    });
  }

  return normalized;
};

export const toWatchlistStock = (
  stock: StockSearchResult,
): WatchlistStock => ({
  secid: stock.secid,
  code: stock.code,
  name: stock.name,
  addedAt: Date.now(),
});
