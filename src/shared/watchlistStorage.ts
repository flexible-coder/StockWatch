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
export const DEFAULT_WATCHLIST_GROUPS = [DEFAULT_WATCHLIST_GROUP];

export const DEFAULT_WATCHLIST: WatchlistStock[] = [
  {
    secid: "1.000001",
    code: "000001",
    name: "上证指数",
    group: DEFAULT_WATCHLIST_GROUP,
    addedAt: 1,
  },
];

const LEGACY_DEFAULT_WATCHLIST_SECIDS = [
  "1.600519",
  "0.300750",
  "1.601318",
  "1.600036",
  "0.002594",
  "116.00700",
  "116.03690",
  "116.09988",
];
const LEGACY_DEFAULT_WATCHLIST_GROUPS = ["价投", DEFAULT_WATCHLIST_GROUP, "ETF"];

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

const isLegacyDefaultWatchlist = (watchlist: WatchlistStock[]) =>
  watchlist.length === LEGACY_DEFAULT_WATCHLIST_SECIDS.length &&
  watchlist.every(
    (stock, index) => stock.secid === LEGACY_DEFAULT_WATCHLIST_SECIDS[index],
  );

const isLegacyDefaultGroups = (groups: string[]) =>
  groups.length === LEGACY_DEFAULT_WATCHLIST_GROUPS.length &&
  groups.every((group, index) => group === LEGACY_DEFAULT_WATCHLIST_GROUPS[index]);

export const getWatchlist = async (): Promise<WatchlistStock[]> => {
  if (!hasChromeStorage()) return DEFAULT_WATCHLIST;

  const result = await chrome.storage.sync.get(WATCHLIST_STORAGE_KEY);
  const stored = result[WATCHLIST_STORAGE_KEY];
  if (stored === undefined) {
    await chrome.storage.sync.set({ [WATCHLIST_STORAGE_KEY]: DEFAULT_WATCHLIST });
    return DEFAULT_WATCHLIST;
  }

  const normalized = normalizeWatchlist(stored);
  if (isLegacyDefaultWatchlist(normalized)) {
    await chrome.storage.sync.set({ [WATCHLIST_STORAGE_KEY]: DEFAULT_WATCHLIST });
    return DEFAULT_WATCHLIST;
  }

  return normalized;
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

  const normalized = normalizeWatchlistGroups(stored);
  if (isLegacyDefaultGroups(normalized)) {
    await chrome.storage.sync.set({
      [WATCHLIST_GROUPS_STORAGE_KEY]: DEFAULT_WATCHLIST_GROUPS,
    });
    return DEFAULT_WATCHLIST_GROUPS;
  }

  return normalized;
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
