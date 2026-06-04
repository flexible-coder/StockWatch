import { DEFAULT_STOCK_CONFIG } from "./stockConfig";
import type { StockSearchResult } from "./stockSearch";

export interface WatchlistStock {
  secid: string;
  code: string;
  name: string;
  group?: string;
  note?: string;
  addedAt: number;
}

export const WATCHLIST_STORAGE_KEY = "tickeye.watchlist";
export const WATCHLIST_GROUPS_STORAGE_KEY = "tickeye.watchlistGroups";
export const DEFAULT_WATCHLIST_GROUP = "观察股";
export const DEFAULT_WATCHLIST_GROUPS = ["价投", DEFAULT_WATCHLIST_GROUP, "ETF"];

export const DEFAULT_WATCHLIST: WatchlistStock[] = [
  {
    secid: DEFAULT_STOCK_CONFIG.secid,
    code: DEFAULT_STOCK_CONFIG.code,
    name: DEFAULT_STOCK_CONFIG.name,
    group: DEFAULT_WATCHLIST_GROUP,
    addedAt: 1,
  },
  {
    secid: "0.300750",
    code: "300750",
    name: "宁德时代",
    group: DEFAULT_WATCHLIST_GROUP,
    addedAt: 2,
  },
  {
    secid: "1.601318",
    code: "601318",
    name: "中国平安",
    group: DEFAULT_WATCHLIST_GROUP,
    addedAt: 3,
  },
  {
    secid: "1.600036",
    code: "600036",
    name: "招商银行",
    group: DEFAULT_WATCHLIST_GROUP,
    addedAt: 4,
  },
  {
    secid: "0.002594",
    code: "002594",
    name: "比亚迪",
    group: DEFAULT_WATCHLIST_GROUP,
    addedAt: 5,
  },
  {
    secid: "116.00700",
    code: "00700",
    name: "腾讯控股",
    group: "价投",
    addedAt: 6,
  },
  {
    secid: "116.03690",
    code: "03690",
    name: "美团-W",
    group: "价投",
    addedAt: 7,
  },
  {
    secid: "116.09988",
    code: "09988",
    name: "阿里巴巴-W",
    group: "价投",
    addedAt: 8,
  },
];

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && !!chrome.storage?.sync;

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeWatchlistGroups = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value : DEFAULT_WATCHLIST_GROUPS;
  const groups: string[] = [];
  for (const item of source) {
    const group = normalizeText(item);
    if (!group || groups.includes(group)) continue;
    groups.push(group);
  }
  return groups.length > 0 ? groups : [DEFAULT_WATCHLIST_GROUP];
};

const normalizeWatchlistStock = (
  value: Partial<WatchlistStock> | null | undefined,
): WatchlistStock | null => {
  if (!value) return null;

  const secid = normalizeText(value.secid);
  const code = normalizeText(value.code);
  const name = normalizeText(value.name);
  if (!/^\d+\.[A-Za-z0-9]+$/.test(secid) || !code || !name) return null;

  const group = normalizeText(value.group) || DEFAULT_WATCHLIST_GROUP;
  const note = normalizeText(value.note);

  return {
    secid,
    code,
    name,
    group,
    note: note || undefined,
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

export const getWatchlistGroups = async (): Promise<string[]> => {
  if (!hasChromeStorage()) return DEFAULT_WATCHLIST_GROUPS;

  const result = await chrome.storage.sync.get(WATCHLIST_GROUPS_STORAGE_KEY);
  const stored = result[WATCHLIST_GROUPS_STORAGE_KEY];
  if (stored === undefined) {
    await chrome.storage.sync.set({
      [WATCHLIST_GROUPS_STORAGE_KEY]: DEFAULT_WATCHLIST_GROUPS,
    });
    return DEFAULT_WATCHLIST_GROUPS;
  }

  return normalizeWatchlistGroups(stored);
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

export const saveWatchlistGroups = async (groups: string[]): Promise<string[]> => {
  const normalized = normalizeWatchlistGroups(groups);

  if (hasChromeStorage()) {
    await chrome.storage.sync.set({
      [WATCHLIST_GROUPS_STORAGE_KEY]: normalized,
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
  group: DEFAULT_WATCHLIST_GROUP,
  addedAt: Date.now(),
});
