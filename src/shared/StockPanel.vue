<script setup lang="ts">
import { computed, h, onUnmounted, ref, watch } from "vue";
import {
  ArrowLeftIcon,
  BarChartIcon,
  BellIcon,
  LineChartIcon,
  ReadIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
} from "./panelIcons";
import IntradayChart from "./IntradayChart.vue";
import MarketIndexCards from "./MarketIndexCards.vue";
import { fetchMarketQuotes, type MarketQuote } from "./quoteApi";
import StockSettingsPanel from "./StockSettingsPanel.vue";
import WatchlistPanel from "./WatchlistPanel.vue";
import type { WatchlistStock } from "./watchlistStorage";

const props = withDefaults(
  defineProps<{
    surface?: "popup" | "sidepanel";
  }>(),
  {
    surface: "popup",
  },
);

const view = ref<"main" | "detail" | "settings">("main");
const searchVisible = ref(false);
const refreshSignal = ref(0);
const selectedStock = ref<WatchlistStock | null>(null);
const detailQuote = ref<MarketQuote | null>(null);
const isDetailQuoteLoading = ref(false);

let detailQuoteController: AbortController | null = null;

const navItems = [
  { key: "watchlist", label: "自选", icon: StarIcon },
  { key: "market", label: "行情", icon: LineChartIcon },
  { key: "analysis", label: "分析", icon: BarChartIcon },
  { key: "news", label: "资讯", icon: ReadIcon },
  { key: "alert", label: "提醒", icon: BellIcon },
];

const detailTrendClass = computed(() => {
  const percent = detailQuote.value?.percent;
  if (!percent) return "flat";
  return percent > 0 ? "up" : "down";
});

const refresh = () => {
  refreshSignal.value += 1;
};

const openStockDetail = (stock: WatchlistStock) => {
  selectedStock.value = stock;
  view.value = "detail";
};

const backToMain = () => {
  view.value = "main";
};

const closeSearch = () => {
  searchVisible.value = false;
};

const formatCode = (stock: WatchlistStock) => {
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

const loadDetailQuote = async () => {
  if (!selectedStock.value) return;

  detailQuoteController?.abort();
  detailQuoteController = new AbortController();
  isDetailQuoteLoading.value = !detailQuote.value;

  try {
    const quotes = await fetchMarketQuotes(
      [selectedStock.value.secid],
      detailQuoteController.signal,
    );
    detailQuote.value = quotes[0] ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    detailQuote.value = null;
  } finally {
    isDetailQuoteLoading.value = false;
    detailQuoteController = null;
  }
};

watch(
  () => selectedStock.value?.secid,
  () => {
    detailQuote.value = null;
    if (view.value === "detail") {
      void loadDetailQuote();
    }
  },
);

watch(
  () => refreshSignal.value,
  () => {
    if (view.value === "detail") {
      void loadDetailQuote();
    }
  },
);

onUnmounted(() => {
  detailQuoteController?.abort();
});
</script>

<template>
  <a-config-provider
    :theme="{
      token: {
        colorPrimary: '#1890ff',
        borderRadius: 8,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      },
    }"
  >
    <main class="stock-panel" :class="[`is-${props.surface}`, `view-${view}`]">
      <aside class="panel-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-button"
          :class="{ active: item.key === 'watchlist' }"
          type="button"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </aside>

      <section class="panel-content">
        <template v-if="view === 'main'">
          <header class="panel-header">
            <h1>自选股</h1>
            <div class="panel-tools">
              <a-tooltip title="搜索添加">
                <a-button
                  type="text"
                  size="large"
                  :icon="h(SearchIcon)"
                  @click="searchVisible = true"
                />
              </a-tooltip>
              <a-tooltip title="刷新">
                <a-button
                  type="text"
                  size="large"
                  :icon="h(RefreshIcon)"
                  @click="refresh"
                />
              </a-tooltip>
              <a-tooltip title="设置">
                <a-button
                  type="text"
                  size="large"
                  :icon="h(SettingsIcon)"
                  @click="view = 'settings'"
                />
              </a-tooltip>
            </div>
          </header>

          <MarketIndexCards :refresh-signal="refreshSignal" />
          <WatchlistPanel
            :refresh-signal="refreshSignal"
            :search-visible="searchVisible"
            :surface="props.surface"
            @select="openStockDetail"
            @close-search="closeSearch"
          />
        </template>

        <template v-else-if="view === 'detail' && selectedStock">
          <header class="detail-header">
            <a-button
              type="text"
              :icon="h(ArrowLeftIcon)"
              @click="backToMain"
            />
            <div class="detail-title">
              <strong>{{ detailQuote?.name ?? selectedStock.name }}</strong>
              <span>{{ formatCode(selectedStock) }}</span>
            </div>
            <a-tooltip title="刷新">
              <a-button type="text" :icon="h(RefreshIcon)" @click="refresh" />
            </a-tooltip>
          </header>

          <section class="detail-content">
            <section class="quote-summary">
              <div>
                <span class="summary-label">最新价</span>
                <strong class="summary-price">
                  {{ formatPrice(detailQuote?.price) }}
                </strong>
              </div>
              <div class="summary-change" :class="detailTrendClass">
                <span>{{ formatSignedNumber(detailQuote?.change) }}</span>
                <strong>{{ formatSignedPercent(detailQuote?.percent) }}</strong>
              </div>
            </section>

            <section class="detail-metrics">
              <div>
                <span>成交量</span>
                <strong>{{ formatLargeNumber(detailQuote?.volume) }}</strong>
              </div>
              <div>
                <span>成交额</span>
                <strong>{{ formatLargeNumber(detailQuote?.amount) }}</strong>
              </div>
              <div>
                <span>市值</span>
                <strong>{{ formatLargeNumber(detailQuote?.marketValue) }}</strong>
              </div>
            </section>

            <section class="chart-section">
              <div class="chart-section-header">
                <strong>分时</strong>
                <span>{{ isDetailQuoteLoading ? "行情更新中" : "实时行情" }}</span>
              </div>
              <IntradayChart
                :secid="selectedStock.secid"
                :height="props.surface === 'popup' ? 250 : 300"
                :refresh-signal="refreshSignal"
              />
            </section>
          </section>
        </template>

        <StockSettingsPanel
          v-else
          :surface="props.surface"
          embedded
          show-back
          @back="view = 'main'"
        />
      </section>
    </main>
  </a-config-provider>
</template>

<style scoped>
.stock-panel {
  width: 100%;
  min-height: 100vh;
  display: flex;
  overflow: hidden;
  border: 1px solid #dfe3e8;
  background: #fff;
  color: #111827;
}

.stock-panel.is-popup {
  height: 620px;
  min-height: 620px;
}

.stock-panel.is-sidepanel {
  min-height: 100vh;
}

.panel-nav {
  width: 64px;
  flex: 0 0 64px;
  padding: 12px 7px;
  border-right: 1px solid #e5e7eb;
  background: #fbfdff;
}

.nav-button {
  width: 50px;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #374151;
  cursor: pointer;
}

.nav-button svg {
  width: 18px;
  height: 18px;
}

.nav-button span {
  font-size: 12px;
  line-height: 1.2;
}

.nav-button.active {
  border-color: #dbeafe;
  background: #fff;
  color: #1890ff;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
}

.panel-content {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  background: #fff;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 16px 18px;
}

.panel-header h1 {
  margin: 0;
  color: #111827;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.1;
}

.panel-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel-tools :deep(.ant-btn) {
  width: 30px;
  height: 30px;
  padding: 0;
  color: #111827;
}

.panel-tools :deep(svg) {
  width: 18px;
  height: 18px;
}

.view-settings .panel-content {
  background: #f8fafc;
}

.detail-header {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-header :deep(.ant-btn) {
  width: 30px;
  height: 30px;
  padding: 0;
}

.detail-header :deep(svg) {
  width: 16px;
  height: 16px;
}

.detail-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.detail-title strong {
  color: #111827;
  font-size: 16px;
  line-height: 1.2;
}

.detail-title span {
  color: #6b7280;
  font-size: 12px;
}

.detail-content {
  min-height: 0;
  flex: 1;
  padding: 12px 14px;
  overflow: auto;
  background: #f8fafc;
}

.quote-summary,
.detail-metrics,
.chart-section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.quote-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.summary-label {
  display: block;
  color: #6b7280;
  font-size: 12px;
}

.summary-price {
  display: block;
  margin-top: 4px;
  color: #1890ff;
  font-size: 16px;
  line-height: 1.2;
}

.summary-change {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
  font-size: 12px;
}

.summary-change strong {
  font-size: 14px;
}

.detail-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: 10px;
  overflow: hidden;
  background: #e5e7eb;
}

.detail-metrics div {
  min-width: 0;
  padding: 10px;
  background: #fff;
}

.detail-metrics span {
  display: block;
  color: #6b7280;
  font-size: 12px;
}

.detail-metrics strong {
  display: block;
  margin-top: 4px;
  color: #111827;
  font-size: 14px;
  line-height: 1.2;
}

.chart-section {
  margin-top: 10px;
  padding: 10px;
}

.chart-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.chart-section-header strong {
  font-size: 14px;
}

.chart-section-header span {
  color: #6b7280;
  font-size: 12px;
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

@media (max-width: 380px) {
  .quote-summary {
    grid-template-columns: 1fr auto;
  }

  .quote-summary :deep(.ant-btn) {
    grid-column: 1 / -1;
  }

  .detail-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
