<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { DeleteIcon, PinIcon, SearchIcon } from "./panelIcons";
import { fetchMarketQuotes, type MarketQuote } from "./quoteApi";
import { saveStockConfig } from "./stockConfig";
import { searchStocks, type StockSearchResult } from "./stockSearch";
import {
  getWatchlist,
  normalizeWatchlist,
  saveWatchlist,
  toWatchlistStock,
  WATCHLIST_STORAGE_KEY,
  type WatchlistStock,
} from "./watchlistStorage";

type AutoCompleteOption = {
  value: string;
  label: string;
  stock: StockSearchResult;
};

const props = defineProps<{
  refreshSignal: number;
  searchVisible: boolean;
  surface: "popup" | "sidepanel";
}>();

const emit = defineEmits<{
  select: [stock: WatchlistStock];
  closeSearch: [];
}>();

const watchlist = ref<WatchlistStock[]>([]);
const quoteBySecid = ref<Record<string, MarketQuote>>({});
const searchText = ref("");
const searchOptions = ref<AutoCompleteOption[]>([]);
const optionByValue = ref<Record<string, StockSearchResult>>({});
const isLoading = ref(true);
const isSearching = ref(false);
const isRefreshing = ref(false);
const hasError = ref(false);
const lastUpdatedAt = ref<number | null>(null);

let searchController: AbortController | null = null;
let quoteController: AbortController | null = null;
let refreshTimer: ReturnType<typeof window.setInterval> | null = null;
let searchSerial = 0;

const watchlistRows = computed(() =>
  watchlist.value.map((stock) => ({
    stock,
    quote: quoteBySecid.value[stock.secid],
  })),
);

const connectionText = computed(() =>
  hasError.value ? "连接异常" : "实时连接",
);

const formatCode = (stock: WatchlistStock | MarketQuote) => {
  const market = stock.secid.split(".")[0];
  const suffix =
    market === "1" ? "SH" : market === "0" ? "SZ" : market === "116" ? "HK" : "";
  return suffix ? `${stock.code}.${suffix}` : stock.code;
};

const formatPrice = (value: number | null | undefined) =>
  value === null || value === undefined ? "--" : value.toFixed(2);

const formatSignedNumber = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "--"
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

const formatSignedPercent = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "--"
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

const formatLargeNumber = (value: number | null | undefined) => {
  if (!value || value <= 0) return "--";
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return Math.round(value).toLocaleString("zh-CN");
};

const formatLastUpdated = () => {
  if (!lastUpdatedAt.value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(lastUpdatedAt.value));
};

const getTrendClass = (value: number | null | undefined) => {
  if (!value) return "flat";
  return value > 0 ? "up" : "down";
};

const formatOptionLabel = (stock: StockSearchResult) => {
  const market = stock.market ? ` ${stock.market}` : "";
  return `${stock.name} ${stock.code}${market}`;
};

const setSearchResults = (results: StockSearchResult[]) => {
  const options = results.map((stock) => ({
    value: `${stock.name} ${stock.code}`,
    label: formatOptionLabel(stock),
    stock,
  }));

  searchOptions.value = options;
  optionByValue.value = Object.fromEntries(
    options.map((option) => [option.value, option.stock]),
  );
};

const closeSearch = () => {
  emit("closeSearch");
};

const loadQuotes = async () => {
  quoteController?.abort();
  quoteController = new AbortController();
  isRefreshing.value = true;
  hasError.value = false;

  try {
    const quotes = await fetchMarketQuotes(
      watchlist.value.map((stock) => stock.secid),
      quoteController.signal,
    );
    quoteBySecid.value = Object.fromEntries(
      quotes.map((quote) => [quote.secid, quote]),
    );
    lastUpdatedAt.value = Date.now();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    hasError.value = true;
  } finally {
    isRefreshing.value = false;
    quoteController = null;
  }
};

const loadWatchlist = async () => {
  isLoading.value = true;
  try {
    watchlist.value = await getWatchlist();
    await loadQuotes();
  } finally {
    isLoading.value = false;
  }
};

const persistWatchlist = async (nextWatchlist: WatchlistStock[]) => {
  watchlist.value = await saveWatchlist(nextWatchlist);
  await loadQuotes();
};

const addStock = async (stock: StockSearchResult) => {
  if (watchlist.value.some((item) => item.secid === stock.secid)) {
    void message.info(`${stock.name} 已在自选股中`);
    return;
  }

  await persistWatchlist([...watchlist.value, toWatchlistStock(stock)]);
  searchText.value = "";
  searchOptions.value = [];
  optionByValue.value = {};
  closeSearch();
  void message.success(`已添加 ${stock.name}`);
};

const removeStock = async (stock: WatchlistStock) => {
  await persistWatchlist(
    watchlist.value.filter((item) => item.secid !== stock.secid),
  );
};

const setFloatingStock = async (stock: WatchlistStock) => {
  if (!/^[01]\.\d{6}$/.test(stock.secid)) {
    void message.warning("网页悬浮窗暂只支持 A 股分时");
    return;
  }

  await saveStockConfig({
    secid: stock.secid,
    code: stock.code,
    name: stock.name,
  });
  void message.success(`悬浮窗已切换到 ${stock.name}`);
};

const handleSearch = async (keyword: string) => {
  searchText.value = keyword;
  const trimmed = keyword.trim();
  if (!trimmed) {
    searchOptions.value = [];
    optionByValue.value = {};
    return;
  }

  searchController?.abort();
  searchController = new AbortController();
  const currentSerial = ++searchSerial;
  isSearching.value = true;

  try {
    const results = await searchStocks(trimmed, searchController.signal);
    if (currentSerial !== searchSerial) return;
    setSearchResults(results);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    searchOptions.value = [];
    optionByValue.value = {};
    void message.warning("暂时没查到匹配股票");
  } finally {
    if (currentSerial === searchSerial) {
      isSearching.value = false;
    }
  }
};

const handleSelect = (value: string) => {
  const stock = optionByValue.value[value];
  if (!stock) return;
  void addStock(stock);
};

const applyCurrentInput = async (value: string) => {
  const keyword = (value ?? searchText.value).trim();
  if (!keyword) return;

  const selectedStock = optionByValue.value[keyword];
  if (selectedStock) {
    await addStock(selectedStock);
    return;
  }

  const results = await searchStocks(keyword);
  if (results[0]) {
    await addStock(results[0]);
    return;
  }

  void message.warning("没有找到对应股票");
};

const handleStorageChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => {
  if (areaName !== "sync") return;
  const nextValue = changes[WATCHLIST_STORAGE_KEY]?.newValue;
  if (!nextValue) return;
  watchlist.value = normalizeWatchlist(nextValue);
  void loadQuotes();
};

onMounted(() => {
  void loadWatchlist();
  refreshTimer = window.setInterval(() => {
    void loadQuotes();
  }, 15000);

  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.addListener(handleStorageChange);
  }
});

onUnmounted(() => {
  searchController?.abort();
  quoteController?.abort();
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.removeListener(handleStorageChange);
  }
});

watch(
  () => props.refreshSignal,
  () => {
    void loadQuotes();
  },
);
</script>

<template>
  <section class="watchlist-panel" :class="`is-${surface}`">
    <a-modal
      :open="searchVisible"
      title="添加自选股"
      :footer="null"
      width="360px"
      @cancel="closeSearch"
    >
      <div class="search-modal-content">
        <p>输入股票名称或代码，选择后加入自选股。</p>
        <a-auto-complete
          v-model:value="searchText"
          class="stock-search"
          :options="searchOptions"
          :filter-option="false"
          @search="handleSearch"
          @select="handleSelect"
        >
          <a-input-search
            placeholder="搜索股票名称 / 代码"
            enter-button="添加"
            :loading="isSearching"
            @search="applyCurrentInput"
          >
            <template #prefix>
              <SearchIcon />
            </template>
          </a-input-search>
        </a-auto-complete>
      </div>
    </a-modal>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 7 }" />

    <div v-else-if="watchlistRows.length === 0" class="empty-state">
      <SearchIcon />
      <strong>暂无自选股</strong>
      <span>点击右上角搜索按钮添加第一只股票</span>
    </div>

    <div v-else class="watchlist">
      <article
        v-for="{ stock, quote } in watchlistRows"
        :key="stock.secid"
        class="stock-row"
        role="button"
        tabindex="0"
        @click="emit('select', stock)"
        @keydown.enter="emit('select', stock)"
      >
        <div class="stock-left">
          <div class="stock-name-line">
            <strong>{{ quote?.name ?? stock.name }}</strong>
            <span>{{ formatCode(quote ?? stock) }}</span>
          </div>
          <div class="stock-meta">成交量 {{ formatLargeNumber(quote?.volume) }}</div>
        </div>

        <div class="stock-extra">
          <span>成交额 {{ formatLargeNumber(quote?.amount) }}</span>
          <span>市值 {{ formatLargeNumber(quote?.marketValue) }}</span>
        </div>

        <div class="stock-right">
          <div class="stock-price">{{ formatPrice(quote?.price) }}</div>
          <div class="stock-change" :class="getTrendClass(quote?.percent)">
            {{ formatSignedNumber(quote?.change) }}
            ({{ formatSignedPercent(quote?.percent) }})
          </div>
        </div>

        <div class="row-actions">
          <a-tooltip title="设为悬浮窗">
            <a-button
              type="text"
              size="small"
              :icon="h(PinIcon)"
              @click.stop="setFloatingStock(stock)"
            />
          </a-tooltip>
          <a-tooltip title="移除">
            <a-button
              type="text"
              size="small"
              danger
              :icon="h(DeleteIcon)"
              @click.stop="removeStock(stock)"
            />
          </a-tooltip>
        </div>
      </article>
    </div>

    <footer class="watchlist-footer">
      <span>最后更新：{{ formatLastUpdated() }}</span>
      <span class="connection" :class="{ error: hasError }">
        <i></i>
        {{ isRefreshing ? "更新中" : connectionText }}
      </span>
    </footer>
  </section>
</template>

<style scoped>
.watchlist-panel {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}

.search-modal-content p {
  margin: 0 0 10px;
  color: #6b7280;
  font-size: 12px;
}

.stock-search {
  width: 100%;
}

.watchlist {
  min-height: 0;
  overflow: auto;
  border-top: 1px solid #e5e7eb;
}

.stock-row {
  position: relative;
  min-height: 72px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}

.stock-row:hover {
  background: #f8fafc;
}

.stock-left,
.stock-right,
.stock-extra {
  min-width: 0;
}

.stock-name-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.stock-name-line strong {
  color: #111827;
  font-size: 14px;
  line-height: 1.25;
  white-space: nowrap;
}

.stock-name-line span {
  color: #4b5563;
  font-size: 12px;
}

.stock-meta,
.stock-extra {
  color: #4b5563;
  font-size: 12px;
}

.stock-meta {
  margin-top: 8px;
}

.stock-extra {
  display: none;
  flex-direction: column;
  gap: 5px;
  white-space: nowrap;
}

.stock-right {
  text-align: right;
}

.stock-price {
  color: #1890ff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.stock-change {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.2;
}

.up {
  color: #f5222d;
}

.down {
  color: #16a34a;
}

.flat {
  color: #6b7280;
}

.row-actions {
  position: absolute;
  right: 8px;
  top: 6px;
  display: none;
  gap: 2px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
}

.row-actions :deep(.ant-btn) {
  width: 24px;
  height: 24px;
  padding: 0;
}

.row-actions :deep(svg),
.stock-search :deep(svg),
.empty-state svg {
  width: 14px;
  height: 14px;
}

.stock-row:hover .row-actions {
  display: flex;
}

.empty-state {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: #6b7280;
}

.empty-state strong {
  color: #111827;
}

.watchlist-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 16px;
  border-top: 1px solid #e5e7eb;
  color: #4b5563;
  font-size: 12px;
}

.connection {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.connection i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
}

.connection.error i {
  background: #9ca3af;
}

.watchlist-panel.is-sidepanel .stock-row {
  grid-template-columns: minmax(150px, 1fr) minmax(120px, 0.7fr) auto;
}

.watchlist-panel.is-sidepanel .stock-extra {
  display: flex;
}

@media (max-width: 520px) {
  .watchlist-panel.is-sidepanel .stock-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .watchlist-panel.is-sidepanel .stock-extra {
    display: none;
  }
}

@media (max-width: 330px) {
  .stock-row {
    grid-template-columns: 1fr;
  }

  .stock-right {
    text-align: left;
  }
}
</style>
