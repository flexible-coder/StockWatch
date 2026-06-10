<template>
  <div v-if="stockConfig.enabled" class="stock-widget-container" :style="widgetPositionStyle">
    <div
      ref="stockCardRef"
      class="stock-card"
      :class="{
        'is-expanded': isExpanded,
        'is-snapped': snapSide !== null && !isExpanded,
        [`snap-${snapSide}`]: snapSide !== null,
      }"
      @pointerdown="handleWidgetPointerDown"
    >
      <div v-if="!isExpanded" class="watchlist-mini-panel">
        <div class="watchlist-mini-titlebar">
          <span class="watchlist-mini-title"></span>
          <div class="watchlist-mini-controls" aria-label="窗口控制">
            <CaretUpOutlined
              class="watchlist-mini-control"
              @click.stop="toggleMiniPanelMinimized"
              v-if="!isMiniPanelMinimized"
            />
            <CaretDownOutlined class="watchlist-mini-control" @click.stop="toggleMiniPanelMinimized" v-else />
            <CloseOutlined class="watchlist-mini-control close" style="font-size: 10px" @click.stop="closeWidget" />
          </div>
        </div>
        <button
          v-for="row in displayedWidgetRows"
          :key="row.stock.secid"
          class="watchlist-mini-row"
          :class="{
            active: row.stock.secid === stockConfig.secid,
            first: row.index === 0,
          }"
          type="button"
          @click.stop="selectWidgetStock(row.stock)"
        >
          <span class="mini-stock-name">{{ row.stock.name }}</span>
          <span class="mini-stock-percent" :class="getTrendClassByPercent(row.percent)">
            {{ formatSignedPercent(row.percent) }}
          </span>
        </button>
      </div>

      <div v-else class="minimal-content" @click="isExpanded = false">
        <div class="stock-top-info">
          <span class="stock-name">{{ stockData.name }}</span>
          <span class="stock-top-metric stock-top-avg"> 均价:{{ displayAvgPriceText }} </span>
          <span class="stock-top-metric stock-top-latest"> 最新:{{ displayPriceText }} </span>
        </div>

        <span class="stock-percent" :class="[trendClass, { 'price-flash': shouldFlash }]">
          {{ formatSignedPercent(stockData.percent) }}
        </span>
      </div>

      <div class="expanded-wrapper">
        <div ref="chartContainerRef" class="chart-container">
          <div
            v-if="volumeDividerTop !== null"
            class="volume-divider"
            aria-hidden="true"
            :style="{ top: `${volumeDividerTop}px` }"
          ></div>
          <div v-if="priceAxisLabels.length" class="price-axis-overlay" aria-hidden="true">
            <span
              v-for="label in priceAxisLabels"
              :key="label.priceText"
              class="price-axis-label"
              :class="label.className"
              :style="{ top: `${label.y}px` }"
            >
              {{ label.priceText }}
            </span>
          </div>
          <div v-if="priceAxisLabels.length" class="percent-axis-overlay" aria-hidden="true">
            <span
              v-for="label in priceAxisLabels"
              :key="label.percentText"
              class="percent-axis-label"
              :class="label.className"
              :style="{ top: `${label.y}px` }"
            >
              {{ label.percentText }}
            </span>
          </div>
        </div>

        <div ref="tooltipRef" class="floating-tooltip" :class="{ visible: !!hoverInfo }">
          <div class="tooltip-price tooltip-time">
            <span>时间</span>
            {{ hoverInfo?.time }}
          </div>
          <div class="tooltip-price" :class="hoverInfo ? getTrendClassByPercent(hoverInfo.percent) : 'flat'">
            <span class="tooltip-label">价格</span>
            <span> {{ hoverInfo?.price.toFixed(2) }}</span>
          </div>
          <div class="tooltip-price" :class="hoverInfo ? getTrendClassByPercent(hoverInfo.percent) : 'flat'">
            <span class="tooltip-label">均价</span>
            <span>{{ hoverInfo?.avgPrice.toFixed(2) }}</span>
          </div>
          <div class="tooltip-price" :class="hoverInfo ? getTrendClassByPercent(hoverInfo.percent) : 'flat'">
            <span class="tooltip-label">涨跌幅</span>
            <span>{{ hoverPercentText }}</span>
          </div>
          <div class="tooltip-price tooltip-volume">
            <span class="tooltip-label">成交量</span>
            <span>{{ hoverInfo ? formatVolume(hoverInfo.volume) : "--" }}</span>
          </div>
          <div class="tooltip-price tooltip-amount">
            <span class="tooltip-label">成交额</span>
            <span>{{ hoverInfo ? formatAmount(hoverInfo.amount) : "--" }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  DEFAULT_STOCK_CONFIG,
  getStockConfig,
  normalizeStockConfig,
  saveStockConfig,
  STOCK_CONFIG_STORAGE_KEY,
  type StockConfig,
} from "@/shared/stockConfig";
import { fetchIntradayData as fetchSharedIntradayData } from "@/shared/intradayApi";
import { fetchMarketQuotes, type MarketQuote } from "@/shared/quoteApi";
import {
  getWatchlist,
  normalizeWatchlist,
  WATCHLIST_STORAGE_KEY,
  type WatchlistStock,
} from "@/shared/watchlistStorage";
import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type AreaData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { CaretDownOutlined, CaretUpOutlined, CloseOutlined } from "@ant-design/icons-vue";
interface Stock {
  name: string;
  price: number;
  percent: number;
}

interface HoverInfo {
  time: string;
  price: number;
  avgPrice: number;
  volume: number;
  amount: number;
  percent: number;
  x: number;
  y: number;
}

interface IntradayPoint {
  time: UTCTimestamp;
  realTime: number;
  marketTime: string;
  minuteIndex: number;
  value: number;
  avgPrice: number;
  volume: number;
  amount: number;
}

interface SymmetricPriceRange {
  minValue: number;
  maxValue: number;
}

interface PriceAxisLabel {
  priceText: string;
  percentText: string;
  y: number;
  className: string;
}

const MARKET_TIME_ZONE = "Asia/Shanghai";
const MARKET_UTC_OFFSET_HOURS = 8;
const MORNING_SESSION_START_MINUTE = 9 * 60 + 30;
const MORNING_SESSION_END_MINUTE = 11 * 60 + 30;
const AFTERNOON_SESSION_START_MINUTE = 13 * 60;
const AFTERNOON_SESSION_END_MINUTE = 15 * 60;
const MORNING_SESSION_POINT_COUNT = MORNING_SESSION_END_MINUTE - MORNING_SESSION_START_MINUTE + 1;
const LAST_TRADING_MINUTE_INDEX = 240;
const TIME_SCALE_EDGE_PADDING_BARS = 0;
const MIN_PRICE_RANGE_RATIO = 0.01;
const PRICE_SCALE_MARGIN_TOP = 0.02;
const PRICE_SCALE_MARGIN_BOTTOM = 0.05;
const VOLUME_SCALE_MARGIN_TOP = 0.08;
const VOLUME_SCALE_MARGIN_BOTTOM = 0;
const OFF_HOURS_POLL_INTERVAL_MS = 1000 * 60 * 2;
const HIDDEN_POLL_INTERVAL_MS = 1000 * 60 * 3;
const SNAP_EDGE_THRESHOLD_PX = 150;
const STOCK_AREA_LINE_COLOR = "#1890ff";
const STOCK_AREA_TOP_COLOR = "rgba(24, 144, 255, 0.22)";
const STOCK_AREA_BOTTOM_COLOR = "rgba(255,255,255,0)";

type SeriesPoint = AreaData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;
type VolumeSeriesPoint = HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

const stockConfig = ref<StockConfig>(DEFAULT_STOCK_CONFIG);
const watchlist = ref<WatchlistStock[]>([]);
const quoteBySecid = ref<Record<string, MarketQuote>>({});
const isExpanded = ref(DEFAULT_STOCK_CONFIG.defaultExpanded);
const isMiniPanelMinimized = ref(false);
const shouldFlash = ref(false);
const stockCardRef = ref<HTMLDivElement | null>(null);
const chartContainerRef = ref<HTMLDivElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);
const rawData = ref<IntradayPoint[]>([]);
const hoverInfo = ref<HoverInfo | null>(null);
const preClosePrice = ref(0);
const isFetching = ref(false);
const priceAxisLabels = ref<PriceAxisLabel[]>([]);
const volumeDividerTop = ref<number | null>(null);
const snapSide = ref<"left" | "right" | null>(null);

const stockData = ref<Stock>({
  name: "加载中...",
  price: 0,
  percent: 0,
});

let chart: IChartApi | null = null;
let priceLineSeries: ISeriesApi<"Area"> | null = null;
let avgLineSeries: ISeriesApi<"Line"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let preClosePriceLine: IPriceLine | null = null;
let resizeObserver: ResizeObserver | null = null;
let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let fetchController: AbortController | null = null;
let quoteFetchController: AbortController | null = null;
let isMounted = false;
let isPointerDragging = false;
let suppressNextRowClick = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTop = 0;
let dragStartRight = 0;

const fullTradingMinuteIndexes = Array.from({ length: LAST_TRADING_MINUTE_INDEX + 1 }, (_, minuteIndex) => minuteIndex);

const getTrendClassByPercent = (percent: number): "up" | "down" | "flat" => {
  if (percent > 0) return "up";
  if (percent < 0) return "down";
  return "flat";
};

const trendClass = computed(() => getTrendClassByPercent(stockData.value.percent));
const fallbackWatchlistStock = computed<WatchlistStock>(() => ({
  secid: stockConfig.value.secid,
  code: stockConfig.value.code,
  name: stockConfig.value.name,
  addedAt: 0,
}));
const visibleWatchlist = computed(() => {
  const source = watchlist.value.length > 0 ? watchlist.value : [fallbackWatchlistStock.value];
  return source.slice(0, 5);
});
const widgetRows = computed(() =>
  visibleWatchlist.value.map((stock, index) => {
    const quote = quoteBySecid.value[stock.secid];
    const percent = quote?.percent ?? (stock.secid === stockConfig.value.secid ? stockData.value.percent : 0);
    return {
      stock,
      quote,
      percent,
      index,
    };
  }),
);
const displayedWidgetRows = computed(() =>
  isMiniPanelMinimized.value ? widgetRows.value.slice(0, 1) : widgetRows.value,
);
const widgetPositionStyle = computed(() => ({
  top: `${stockConfig.value.position.top}px`,
  right: `${stockConfig.value.position.right}px`,
}));

const latestTime = computed(() => {
  const lastPoint = rawData.value[rawData.value.length - 1];
  return lastPoint ? lastPoint.marketTime : "";
});

const displayTime = computed(() => hoverInfo.value?.time ?? latestTime.value);
const displayPrice = computed(() => hoverInfo.value?.price ?? stockData.value.price);
const latestAvgPrice = computed(() => {
  const lastPoint = rawData.value[rawData.value.length - 1];
  return lastPoint?.avgPrice ?? 0;
});
const displayAvgPrice = computed(() => hoverInfo.value?.avgPrice ?? latestAvgPrice.value);
const displayPriceText = computed(() => (displayPrice.value > 0 ? displayPrice.value.toFixed(2) : "--"));
const displayAvgPriceText = computed(() => (displayAvgPrice.value > 0 ? displayAvgPrice.value.toFixed(2) : "--"));
const displayPercent = computed(() => hoverInfo.value?.percent ?? stockData.value.percent);
const displayTrendClass = computed(() => getTrendClassByPercent(displayPercent.value));
const formatSignedPercent = (percent: number): string => `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
const displayPercentText = computed(() => formatSignedPercent(displayPercent.value));
const hoverPercentText = computed(() => {
  if (!hoverInfo.value) return "";
  return formatSignedPercent(hoverInfo.value.percent);
});

const buildFullTradingSeriesData = (
  points: IntradayPoint[],
  valueGetter: (point: IntradayPoint) => number,
): SeriesPoint[] => {
  const pointByMinuteIndex = new Map(points.map((point) => [point.minuteIndex, point]));

  return fullTradingMinuteIndexes.map((minuteIndex) => {
    const time = minuteIndexToSyntheticTimestamp(minuteIndex);
    const point = pointByMinuteIndex.get(minuteIndex);
    return point ? { time, value: valueGetter(point) } : { time };
  });
};

const buildVolumeSeriesData = (points: IntradayPoint[]): VolumeSeriesPoint[] => {
  const pointByMinuteIndex = new Map(points.map((point) => [point.minuteIndex, point]));

  return fullTradingMinuteIndexes.map((minuteIndex) => {
    const time = minuteIndexToSyntheticTimestamp(minuteIndex);
    const point = pointByMinuteIndex.get(minuteIndex);
    if (!point) return { time };

    const previousPoint = pointByMinuteIndex.get(minuteIndex - 1);
    const comparePrice = previousPoint?.value ?? preClosePrice.value;
    const color = comparePrice > 0 && point.value < comparePrice ? "#089981" : "#f23645";

    return {
      time,
      value: point.volume,
      color,
    };
  });
};

const seriesData = computed<SeriesPoint[]>(() => buildFullTradingSeriesData(rawData.value, (point) => point.value));
const avgSeriesData = computed<SeriesPoint[]>(() =>
  buildFullTradingSeriesData(rawData.value, (point) => point.avgPrice),
);
const volumeSeriesData = computed<VolumeSeriesPoint[]>(() => buildVolumeSeriesData(rawData.value));
const pointIndex = computed(() => new Map(rawData.value.map((point) => [point.time, point])));

const calculateSymmetricPriceRange = (points: IntradayPoint[], preClose: number): SymmetricPriceRange | null => {
  if (preClose <= 0) return null;

  const validPrices = points.map((point) => point.value).filter((price) => Number.isFinite(price) && price > 0);
  const minDiff = Math.max(preClose * MIN_PRICE_RANGE_RATIO, 0.01);

  if (validPrices.length === 0) {
    return {
      minValue: preClose - minDiff,
      maxValue: preClose + minDiff,
    };
  }

  const maxPrice = Math.max(...validPrices);
  const minPrice = Math.min(...validPrices);
  const maxDiff = Math.max(Math.abs(maxPrice - preClose), Math.abs(minPrice - preClose), minDiff);

  return {
    minValue: preClose - maxDiff,
    maxValue: preClose + maxDiff,
  };
};

const yAxisPriceRange = computed(() => calculateSymmetricPriceRange(rawData.value, preClosePrice.value));

const getSymmetricAutoscaleInfo = () => {
  const range = yAxisPriceRange.value;
  if (!range) return null;

  return {
    priceRange: range,
    margins: {
      above: 0,
      below: 0,
    },
  };
};

const getAxisLabelPriceValues = (): number[] => {
  const range = yAxisPriceRange.value;
  if (!range || preClosePrice.value <= 0) return [];

  return [
    range.maxValue,
    (range.maxValue + preClosePrice.value) / 2,
    preClosePrice.value,
    (range.minValue + preClosePrice.value) / 2,
    range.minValue,
  ];
};

const formatVolume = (volume: number): string => {
  if (!Number.isFinite(volume) || volume <= 0) return "0";
  if (volume >= 10000) return `${(volume / 10000).toFixed(2)}万`;
  return `${Math.round(volume)}`;
};

const formatAmount = (amount: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(2)}亿`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(2)}万`;
  return `${Math.round(amount)}`;
};

const syncAxisOverlayLabels = () => {
  if (!priceLineSeries || preClosePrice.value <= 0) {
    priceAxisLabels.value = [];
    volumeDividerTop.value = null;
    return;
  }

  const range = yAxisPriceRange.value;
  const dividerY = range ? priceLineSeries.priceToCoordinate(range.minValue) : null;
  volumeDividerTop.value = dividerY === null ? null : dividerY;

  priceAxisLabels.value = getAxisLabelPriceValues().flatMap((price) => {
    const y = priceLineSeries?.priceToCoordinate(price);
    if (y === null || y === undefined) return [];

    const percent = ((price - preClosePrice.value) / preClosePrice.value) * 100;
    return {
      priceText: price.toFixed(2),
      percentText: formatSignedPercent(percent),
      y,
      className: getTrendClassByPercent(percent),
    };
  });
};

const getTimestampFromTime = (time: Time | undefined): number | null => {
  if (time === undefined) return null;
  if (typeof time === "number") return time;
  if (typeof time === "object" && "timestamp" in time && typeof time.timestamp === "number") return time.timestamp;
  return null;
};

const minuteIndexToSyntheticTimestamp = (minuteIndex: number): UTCTimestamp => {
  return minuteIndex as UTCTimestamp;
};

const syntheticTimestampToMinuteIndex = (timestamp: number): number | null => {
  const minuteIndex = Math.round(timestamp);
  if (!Number.isInteger(minuteIndex)) return null;
  if (minuteIndex < 0 || minuteIndex > LAST_TRADING_MINUTE_INDEX) return null;
  return minuteIndex;
};

const shanghaiMinutesFromTimestamp = (timestamp: number): number => {
  const shanghaiDate = new Date((timestamp + MARKET_UTC_OFFSET_HOURS * 3600) * 1000);
  return shanghaiDate.getUTCHours() * 60 + shanghaiDate.getUTCMinutes();
};

const shanghaiMinutesToTradingMinuteIndex = (minutes: number): number | null => {
  if (minutes >= MORNING_SESSION_START_MINUTE && minutes <= MORNING_SESSION_END_MINUTE) {
    return minutes - MORNING_SESSION_START_MINUTE;
  }

  if (minutes >= AFTERNOON_SESSION_START_MINUTE && minutes <= AFTERNOON_SESSION_END_MINUTE) {
    if (minutes === AFTERNOON_SESSION_END_MINUTE) return LAST_TRADING_MINUTE_INDEX;

    const minuteIndex = MORNING_SESSION_POINT_COUNT + (minutes - AFTERNOON_SESSION_START_MINUTE);
    return minuteIndex <= LAST_TRADING_MINUTE_INDEX ? minuteIndex : null;
  }

  return null;
};

const timestampToTradingMinuteIndex = (timestamp: number): number | null => {
  return shanghaiMinutesToTradingMinuteIndex(shanghaiMinutesFromTimestamp(timestamp));
};

const extractMarketMinutesFromDateTimeText = (dateTimeText: string): number | null => {
  const fullDateTimeMatch = dateTimeText.match(/^\d{4}-\d{2}-\d{2}\s+(\d{2}):(\d{2})$/);
  if (fullDateTimeMatch) {
    return Number(fullDateTimeMatch[1]) * 60 + Number(fullDateTimeMatch[2]);
  }

  const timeOnlyMatch = dateTimeText.match(/^(\d{2}):(\d{2})$/);
  if (timeOnlyMatch) {
    return Number(timeOnlyMatch[1]) * 60 + Number(timeOnlyMatch[2]);
  }

  return null;
};

const dateTimeTextToTradingMinuteIndex = (dateTimeText: string): number | null => {
  const minutes = extractMarketMinutesFromDateTimeText(dateTimeText);
  if (typeof minutes !== "number") return null;
  return shanghaiMinutesToTradingMinuteIndex(minutes);
};

const formatClockFromMinutes = (minutes: number): string => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const formatMarketTimeFromMinuteIndex = (minuteIndex: number): string => {
  if (minuteIndex < 0 || minuteIndex > LAST_TRADING_MINUTE_INDEX) return "";
  if (minuteIndex === LAST_TRADING_MINUTE_INDEX) return "15:00";
  if (minuteIndex < MORNING_SESSION_POINT_COUNT) {
    return formatClockFromMinutes(MORNING_SESSION_START_MINUTE + minuteIndex);
  }
  return formatClockFromMinutes(AFTERNOON_SESSION_START_MINUTE + (minuteIndex - MORNING_SESSION_POINT_COUNT));
};

const formatMarketTimeFromDateTimeText = (dateTimeText: string): string => {
  const minutes = extractMarketMinutesFromDateTimeText(dateTimeText);
  if (typeof minutes !== "number") return "";
  return formatClockFromMinutes(minutes);
};

const getFullTradingVisibleLogicalRange = () => ({
  // from: -TIME_SCALE_EDGE_PADDING_BARS,
  from: 0,
  to: LAST_TRADING_MINUTE_INDEX + TIME_SCALE_EDGE_PADDING_BARS,
});

const formatAxisTimeFromChartTime = (time: Time | undefined): string => {
  const syntheticTimestamp = getTimestampFromTime(time);
  if (typeof syntheticTimestamp !== "number") return "";
  const minuteIndex = syntheticTimestampToMinuteIndex(syntheticTimestamp);
  if (typeof minuteIndex !== "number") return "";

  if (minuteIndex === 0) return "09:30";
  // if (minuteIndex === 60) return "10:30";
  if (minuteIndex === 120) return "11:30";
  // if (minuteIndex === MORNING_SESSION_POINT_COUNT + 59 || minuteIndex === MORNING_SESSION_POINT_COUNT + 60) {
  //   return "14:00";
  // }
  if (minuteIndex === LAST_TRADING_MINUTE_INDEX) {
    return "15:00";
  }
  return "";
};

const parseEastMoneyDateTimeToTimestamp = (dateTimeText: string): number | null => {
  const fullDateTimeMatch = dateTimeText.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (fullDateTimeMatch) {
    const year = Number(fullDateTimeMatch[1]);
    const month = Number(fullDateTimeMatch[2]);
    const day = Number(fullDateTimeMatch[3]);
    const hours = Number(fullDateTimeMatch[4]);
    const minutes = Number(fullDateTimeMatch[5]);
    return Math.floor(Date.UTC(year, month - 1, day, hours - MARKET_UTC_OFFSET_HOURS, minutes) / 1000);
  }

  const timeOnlyMatch = dateTimeText.match(/^(\d{2}):(\d{2})$/);
  if (timeOnlyMatch) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const hours = Number(timeOnlyMatch[1]);
    const minutes = Number(timeOnlyMatch[2]);
    return Math.floor(Date.UTC(year, month, day, hours - MARKET_UTC_OFFSET_HOURS, minutes) / 1000);
  }

  return null;
};

const formatMarketTimeFromChartTime = (time: Time | undefined): string => {
  const syntheticTimestamp = getTimestampFromTime(time);
  if (typeof syntheticTimestamp !== "number") return "";
  const minuteIndex = syntheticTimestampToMinuteIndex(syntheticTimestamp);
  if (typeof minuteIndex !== "number") return "";
  return formatMarketTimeFromMinuteIndex(minuteIndex);
};

const parseFiniteNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTrendPrice = (fields: string[]): number | null => {
  return parseFiniteNumber(fields[2]) ?? parseFiniteNumber(fields[1]);
};

const getTrendAveragePrice = (fields: string[], price: number): number => {
  const apiAveragePrice = parseFiniteNumber(fields[7]);
  if (apiAveragePrice && apiAveragePrice > 0) return apiAveragePrice;

  const volume = parseFiniteNumber(fields[5]);
  const amount = parseFiniteNumber(fields[6]);
  if (volume && amount && volume > 0) {
    const isReasonableAverage = (value: number) => value > price * 0.2 && value < price * 5;
    const directAverage = amount / volume;
    if (Number.isFinite(directAverage) && directAverage > 0 && isReasonableAverage(directAverage)) return directAverage;

    const handAverage = amount / (volume * 100);
    if (Number.isFinite(handAverage) && handAverage > 0 && isReasonableAverage(handAverage)) return handAverage;
  }

  return price;
};

const getShanghaiNow = (): Date => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: MARKET_TIME_ZONE }));
};

const isTradingSessionNow = (): boolean => {
  const now = getShanghaiNow();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const inMorning = minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30;
  const inAfternoon = minutes >= 13 * 60 && minutes <= 15 * 60;
  return inMorning || inAfternoon;
};

const getNextPollInterval = (): number => {
  if (document.hidden) return HIDDEN_POLL_INTERVAL_MS;
  return isTradingSessionNow() ? stockConfig.value.tradingPollIntervalMs : OFF_HOURS_POLL_INTERVAL_MS;
};

const clearPollingTimer = () => {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
};

const scheduleNextPoll = () => {
  if (!isMounted || !stockConfig.value.enabled) return;

  clearPollingTimer();
  pollingTimer = setTimeout(() => {
    void runPollingCycle();
  }, getNextPollInterval());
};

const runPollingCycle = async () => {
  if (!isMounted || !stockConfig.value.enabled) return;

  await fetchWidgetQuotes();
  await fetchIntradayData();
  scheduleNextPoll();
};

const refreshPollingSchedule = () => {
  if (!isMounted) return;

  clearPollingTimer();
  if (!stockConfig.value.enabled) return;
  if (document.hidden) {
    scheduleNextPoll();
    return;
  }

  void runPollingCycle();
};

const abortFetch = () => {
  if (fetchController) {
    fetchController.abort();
    fetchController = null;
  }
};

const abortQuoteFetch = () => {
  if (quoteFetchController) {
    quoteFetchController.abort();
    quoteFetchController = null;
  }
};

const loadWatchlist = async () => {
  watchlist.value = await getWatchlist();
};

const fetchWidgetQuotes = async () => {
  const secids = visibleWatchlist.value.map((stock) => stock.secid);
  if (secids.length === 0) return;

  abortQuoteFetch();
  quoteFetchController = new AbortController();

  try {
    const quotes = await fetchMarketQuotes(secids, quoteFetchController.signal);
    quoteBySecid.value = Object.fromEntries(quotes.map((quote) => [quote.secid, quote]));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  } finally {
    quoteFetchController = null;
  }
};

const selectWidgetStock = (stock: WatchlistStock) => {
  if (suppressNextRowClick) {
    suppressNextRowClick = false;
    return;
  }

  const nextConfig = {
    ...stockConfig.value,
    secid: stock.secid,
    code: stock.code,
    name: stock.name,
  };

  applyStockConfig(nextConfig);
  void saveStockConfig(nextConfig);
  isExpanded.value = true;
};

const toggleMiniPanelMinimized = () => {
  isMiniPanelMinimized.value = !isMiniPanelMinimized.value;
};

const closeWidget = () => {
  const nextConfig = {
    ...stockConfig.value,
    enabled: false,
  };

  applyStockConfig(nextConfig);
  void saveStockConfig(nextConfig);
};

const clampWidgetPosition = (top: number, right: number) => {
  const card = stockCardRef.value;
  const width = card?.offsetWidth || 180;
  const height = card?.offsetHeight || 250;
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  const maxRight = Math.max(8, window.innerWidth - width - 8);

  return {
    top: Math.min(maxTop, Math.max(8, Math.round(top))),
    right: Math.min(maxRight, Math.max(8, Math.round(right))),
  };
};

const saveWidgetPosition = (top: number, right: number) => {
  const position = clampWidgetPosition(top, right);
  stockConfig.value = {
    ...stockConfig.value,
    position,
  };

  void saveStockConfig({
    ...stockConfig.value,
    position,
  });
};

const snapWidgetToEdge = () => {
  const card = stockCardRef.value;
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const distanceToLeft = rect.left;
  const distanceToRight = window.innerWidth - rect.right;
  const isNearLeft = distanceToLeft <= SNAP_EDGE_THRESHOLD_PX;
  const isNearRight = distanceToRight <= SNAP_EDGE_THRESHOLD_PX;

  if (!isNearLeft && !isNearRight) {
    snapSide.value = null;
    saveWidgetPosition(rect.top, window.innerWidth - rect.right);
    return;
  }

  const nextSide = distanceToLeft <= distanceToRight ? "left" : "right";
  const nextRight = nextSide === "right" ? 8 : Math.max(8, window.innerWidth - rect.width - 8);

  snapSide.value = nextSide;
  saveWidgetPosition(rect.top, nextRight);
};

const handleWidgetPointerMove = (event: PointerEvent) => {
  if (!isPointerDragging) return;

  const deltaX = event.clientX - dragStartX;
  const deltaY = event.clientY - dragStartY;
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    dragMoved = true;
    suppressNextRowClick = true;
  }

  if (!dragMoved) return;

  snapSide.value = null;
  const nextTop = dragStartTop + deltaY;
  const nextRight = dragStartRight - deltaX;
  const position = clampWidgetPosition(nextTop, nextRight);
  stockConfig.value = {
    ...stockConfig.value,
    position,
  };
};

const handleWidgetPointerUp = () => {
  if (!isPointerDragging) return;
  isPointerDragging = false;
  document.removeEventListener("pointermove", handleWidgetPointerMove);
  document.removeEventListener("pointerup", handleWidgetPointerUp);
  if (dragMoved) {
    snapWidgetToEdge();
  }
};

const handleWidgetPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  if (isExpanded.value && (event.target as HTMLElement).closest(".chart-container")) {
    return;
  }

  const rect = stockCardRef.value?.getBoundingClientRect();
  if (!rect) return;

  isPointerDragging = true;
  suppressNextRowClick = false;
  dragMoved = false;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartTop = rect.top;
  dragStartRight = window.innerWidth - rect.right;
  document.addEventListener("pointermove", handleWidgetPointerMove);
  document.addEventListener("pointerup", handleWidgetPointerUp);
};

const isSameRawData = (next: IntradayPoint[]): boolean => {
  const prev = rawData.value;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;

  const lastPrev = prev[prev.length - 1];
  const lastNext = next[next.length - 1];
  if (lastPrev.realTime !== lastNext.realTime || lastPrev.value !== lastNext.value) return false;
  if (
    lastPrev.avgPrice !== lastNext.avgPrice ||
    lastPrev.volume !== lastNext.volume ||
    lastPrev.amount !== lastNext.amount
  )
    return false;
  if (lastPrev.marketTime !== lastNext.marketTime) return false;

  const firstPrev = prev[0];
  const firstNext = next[0];
  return (
    firstPrev.realTime === firstNext.realTime &&
    firstPrev.value === firstNext.value &&
    firstPrev.avgPrice === firstNext.avgPrice &&
    firstPrev.volume === firstNext.volume &&
    firstPrev.amount === firstNext.amount &&
    firstPrev.marketTime === firstNext.marketTime
  );
};

const syncPreClosePriceLine = () => {
  if (!priceLineSeries) return;

  if (preClosePrice.value <= 0) {
    if (preClosePriceLine) {
      priceLineSeries.removePriceLine(preClosePriceLine);
      preClosePriceLine = null;
    }
    return;
  }

  const options = {
    price: preClosePrice.value,
    color: "rgba(0, 0, 0, 0.1)",
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    lineVisible: true,
    axisLabelVisible: false,
    title: "",
    axisLabelColor: "rgba(117, 134, 150, 0.9)",
    axisLabelTextColor: "#fff",
  } as const;

  if (preClosePriceLine) {
    preClosePriceLine.applyOptions(options);
    return;
  }

  preClosePriceLine = priceLineSeries.createPriceLine(options);
};

const requestAxisOverlaySync = () => {
  requestAnimationFrame(syncAxisOverlayLabels);
};

const applyFullTradingVisibleRange = () => {
  if (!chart) return;
  chart.timeScale().fitContent();
  chart.timeScale().setVisibleLogicalRange(getFullTradingVisibleLogicalRange());
  requestAxisOverlaySync();
};

const applySeriesData = (nextData: SeriesPoint[]) => {
  if (!priceLineSeries) return;
  priceLineSeries.setData(nextData);
  applyFullTradingVisibleRange();
};

const applyAvgSeriesData = (nextData: SeriesPoint[]) => {
  if (!avgLineSeries) return;
  avgLineSeries.setData(nextData);
  applyFullTradingVisibleRange();
};

const applyVolumeSeriesData = (nextData: VolumeSeriesPoint[]) => {
  if (!volumeSeries) return;
  volumeSeries.setData(nextData);
  applyFullTradingVisibleRange();
};

const syncPriceSeriesData = (next: IntradayPoint[]) => {
  if (!priceLineSeries) return;
  const nextPriceData = buildFullTradingSeriesData(next, (point) => point.value);
  const nextAvgData = buildFullTradingSeriesData(next, (point) => point.avgPrice);
  applySeriesData(nextPriceData);
  applyAvgSeriesData(nextAvgData);
  applyVolumeSeriesData(buildVolumeSeriesData(next));
};

const resetStockState = () => {
  rawData.value = [];
  hoverInfo.value = null;
  preClosePrice.value = 0;
  stockData.value = {
    name: stockConfig.value.name || "加载中...",
    price: 0,
    percent: 0,
  };
  priceAxisLabels.value = [];
  volumeDividerTop.value = null;
  syncPreClosePriceLine();
  const emptyPriceData = buildFullTradingSeriesData([], (point) => point.value);
  const emptyAvgData = buildFullTradingSeriesData([], (point) => point.avgPrice);
  applySeriesData(emptyPriceData);
  applyAvgSeriesData(emptyAvgData);
  applyVolumeSeriesData(buildVolumeSeriesData([]));
};

const applyStockConfig = (nextConfig: Partial<StockConfig> | undefined) => {
  const normalizedConfig = normalizeStockConfig(nextConfig);
  const stockChanged = normalizedConfig.secid !== stockConfig.value.secid;
  const enabledChanged = normalizedConfig.enabled !== stockConfig.value.enabled;
  const pollIntervalChanged = normalizedConfig.tradingPollIntervalMs !== stockConfig.value.tradingPollIntervalMs;

  stockConfig.value = normalizedConfig;

  if (normalizedConfig.defaultExpanded && !isExpanded.value) {
    isExpanded.value = true;
  }

  if (stockChanged) {
    abortFetch();
    resetStockState();
  }

  if (enabledChanged && !normalizedConfig.enabled) {
    clearPollingTimer();
    return;
  }

  if (stockChanged || enabledChanged || pollIntervalChanged) {
    refreshPollingSchedule();
  }
};

const handleStockConfigStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
  if (areaName !== "sync") return;

  const nextValue = changes[STOCK_CONFIG_STORAGE_KEY]?.newValue as Partial<StockConfig> | undefined;
  if (nextValue) {
    applyStockConfig(nextValue);
  }

  const nextWatchlist = changes[WATCHLIST_STORAGE_KEY]?.newValue;
  if (nextWatchlist) {
    watchlist.value = normalizeWatchlist(nextWatchlist);
    void fetchWidgetQuotes();
  }
};

const handleRuntimeMessage = (message: { type?: string }) => {
  if (message.type !== "TOGGLE_FEATURE") return;

  void saveStockConfig({
    ...stockConfig.value,
    enabled: !stockConfig.value.enabled,
  });
};

const handleDocumentClick = (event: MouseEvent) => {
  if (!isExpanded.value) return;
  if (stockCardRef.value?.contains(event.target as Node)) return;

  isExpanded.value = false;
  hideHover();
};

watch(
  () => stockData.value.price,
  () => {
    shouldFlash.value = false;
    requestAnimationFrame(() => {
      shouldFlash.value = true;
    });
  },
);

const applyTooltipPosition = (x: number, y: number) => {
  if (!tooltipRef.value || !chartContainerRef.value) return;

  const tooltip = tooltipRef.value;
  const containerRect = chartContainerRef.value.getBoundingClientRect();

  const margin = 50;
  let left = x + margin;
  let top = y + margin;

  const estimatedWidth = tooltip.offsetWidth || 110;
  const estimatedHeight = tooltip.offsetHeight || 52;

  if (left + estimatedWidth > containerRect.width) {
    left = x - estimatedWidth - margin;
  }

  if (top + estimatedHeight > containerRect.height) {
    top = y - estimatedHeight - margin;
  }

  tooltip.style.left = `${Math.max(0, left)}px`;
  tooltip.style.top = `${Math.max(0, top)}px`;
};

const hideHover = () => {
  hoverInfo.value = null;
};

const initChart = () => {
  if (!isMounted || !isExpanded.value) return;
  if (!chartContainerRef.value) return;

  if (chart && priceLineSeries) return;

  const width = chartContainerRef.value.clientWidth;
  const height = chartContainerRef.value.clientHeight;
  if (width < 100) return;

  chart = createChart(chartContainerRef.value, {
    width,
    height: height || 120,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "#999",
      fontSize: 10,
      attributionLogo: false,
    },
    localization: {
      locale: "zh-CN",
      timeFormatter: (time: Time) => formatMarketTimeFromChartTime(time),
    },
    grid: {
      vertLines: {
        visible: true,
        color: "rgba(0,0,0,0.1)",
        style: LineStyle.Dotted,
      },
      horzLines: {
        visible: false,
        color: "rgba(0,0,0,0.1)",
        style: LineStyle.Dotted,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: STOCK_AREA_LINE_COLOR,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: STOCK_AREA_LINE_COLOR,
      },
      horzLine: {
        color: STOCK_AREA_LINE_COLOR,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: STOCK_AREA_LINE_COLOR,
      },
    },
    leftPriceScale: {
      visible: false,
      borderColor: "rgba(0,0,0,0.1)",
      borderVisible: true,
      ensureEdgeTickMarksVisible: true,
      entireTextOnly: false,
      scaleMargins: {
        top: PRICE_SCALE_MARGIN_TOP,
        bottom: PRICE_SCALE_MARGIN_BOTTOM,
      },
    },
    rightPriceScale: {
      visible: false,
      borderColor: "rgba(0,0,0,0.1)",
      borderVisible: true,
      ensureEdgeTickMarksVisible: true,
      entireTextOnly: false,
      scaleMargins: {
        top: PRICE_SCALE_MARGIN_TOP,
        bottom: PRICE_SCALE_MARGIN_BOTTOM,
      },
    },
    timeScale: {
      barSpacing: 0,
      borderVisible: false,
      borderColor: "rgba(0,0,0,0)",
      timeVisible: true,
      fixLeftEdge: true,
      secondsVisible: false,
      ticksVisible: false,
      allowBoldLabels: false,

      tickMarkFormatter: (time: Time) => formatAxisTimeFromChartTime(time),
    },
    handleScroll: { vertTouchDrag: false },
    handleScale: false,
  });

  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver((entries) => {
    if (!chart) return;
    for (const entry of entries) {
      const { width: nextWidth, height: nextHeight } = entry.contentRect;
      if (nextWidth > 0) {
        chart.applyOptions({ width: nextWidth, height: nextHeight || 120 });
        applyFullTradingVisibleRange();
        requestAxisOverlaySync();
      }
    }
  });
  resizeObserver.observe(chartContainerRef.value);

  volumeSeries = chart.addSeries(
    HistogramSeries,
    {
      priceScaleId: "volume",
      priceFormat: {
        type: "volume",
      },
      priceLineVisible: false,
      lastValueVisible: false,
    },
    1,
  );
  const [pricePane, volumePane] = chart.panes();
  pricePane?.setStretchFactor(3);
  volumePane?.setStretchFactor(1.5);
  chart.priceScale("volume", 1).applyOptions({
    scaleMargins: {
      top: VOLUME_SCALE_MARGIN_TOP,
      bottom: VOLUME_SCALE_MARGIN_BOTTOM,
    },
  });

  avgLineSeries = chart.addSeries(LineSeries, {
    priceScaleId: "left",
    color: "#f5a623",
    lineWidth: 1,
    autoscaleInfoProvider: getSymmetricAutoscaleInfo,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  priceLineSeries = chart.addSeries(AreaSeries, {
    priceScaleId: "left",
    lineColor: STOCK_AREA_LINE_COLOR,
    topColor: STOCK_AREA_TOP_COLOR,
    bottomColor: STOCK_AREA_BOTTOM_COLOR,
    lineWidth: 1,
    priceFormat: { type: "price", minMove: 0.01 },
    autoscaleInfoProvider: getSymmetricAutoscaleInfo,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBorderColor: "#fff",
    crosshairMarkerBorderWidth: 2,
  });
  syncPreClosePriceLine();

  chart.subscribeCrosshairMove((param) => {
    if (!priceLineSeries || !param.point || param.time === undefined) {
      hideHover();
      return;
    }

    const priceData = param.seriesData.get(priceLineSeries) as { value?: number } | undefined;
    if (!priceData || typeof priceData.value !== "number") {
      hideHover();
      return;
    }

    const syntheticTimestamp = getTimestampFromTime(param.time);
    if (typeof syntheticTimestamp !== "number") {
      hideHover();
      return;
    }

    const point = pointIndex.value.get(syntheticTimestamp as UTCTimestamp);
    if (!point || preClosePrice.value <= 0) {
      hideHover();
      return;
    }

    hoverInfo.value = {
      time: point.marketTime,
      price: point.value,
      avgPrice: point.avgPrice,
      volume: point.volume,
      amount: point.amount,
      percent: ((point.value - preClosePrice.value) / preClosePrice.value) * 100,
      x: param.point.x,
      y: param.point.y,
    };

    requestAnimationFrame(() => {
      if (hoverInfo.value) {
        applyTooltipPosition(hoverInfo.value.x, hoverInfo.value.y);
      }
    });
  });

  chartContainerRef.value.addEventListener("mouseleave", hideHover);
  applySeriesData(seriesData.value);
  applyAvgSeriesData(avgSeriesData.value);
  applyVolumeSeriesData(volumeSeriesData.value);
  applyFullTradingVisibleRange();
  requestAxisOverlaySync();
};

const fetchIntradayData = async () => {
  if (isFetching.value || !stockConfig.value.enabled) return;
  isFetching.value = true;
  fetchController = new AbortController();
  const stockSecid = stockConfig.value.secid;

  try {
    const result = await fetchSharedIntradayData(stockSecid, fetchController.signal);
    const preClose = result.preClose;
    preClosePrice.value = preClose;
    syncPreClosePriceLine();

    const parsedData: IntradayPoint[] = result.points.map((point) => ({
      ...point,
      time: point.time as UTCTimestamp,
    }));
    if (!isSameRawData(parsedData)) {
      rawData.value = parsedData;
      syncPriceSeriesData(parsedData);
    }

    if (result.name) {
      stockData.value.name = result.name;
    }

    if (result.currentPrice > 0 && preClose > 0) {
      stockData.value.price = result.currentPrice;
      stockData.value.percent = result.percent;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.error("获取分时数据失败:", error);
  } finally {
    fetchController = null;
    isFetching.value = false;
  }
};

onMounted(async () => {
  stockConfig.value = await getStockConfig();
  await loadWatchlist();
  isExpanded.value = stockConfig.value.defaultExpanded;
  resetStockState();

  await nextTick();
  isMounted = true;
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("visibilitychange", refreshPollingSchedule);
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.addListener(handleStockConfigStorageChange);
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);
  }
  void runPollingCycle();
  if (isExpanded.value) {
    requestAnimationFrame(initChart);
  }
});

watch(isExpanded, async (expanded) => {
  if (!expanded) return;

  await nextTick();
  requestAnimationFrame(initChart);
});

onUnmounted(() => {
  isMounted = false;
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("visibilitychange", refreshPollingSchedule);
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.removeListener(handleStockConfigStorageChange);
    chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
  }

  if (chartContainerRef.value) {
    chartContainerRef.value.removeEventListener("mouseleave", hideHover);
  }

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  clearPollingTimer();
  abortFetch();
  abortQuoteFetch();
  document.removeEventListener("pointermove", handleWidgetPointerMove);
  document.removeEventListener("pointerup", handleWidgetPointerUp);

  if (chart) {
    chart.remove();
    chart = null;
  }

  priceLineSeries = null;
  avgLineSeries = null;
  volumeSeries = null;
  preClosePriceLine = null;
});
</script>

<style scoped lang="less">
@keyframes priceBeat {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  20% {
    transform: scale(1.1);
    opacity: 0.8;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.price-flash {
  animation: priceBeat 0.4s linear;
  display: inline-block;
  will-change: transform, opacity;
}

.stock-widget-container {
  position: fixed;
  right: 20px;
  top: 80px;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #333;
  user-select: none;
}

.stock-card {
  width: 150px;
  min-height: 40px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  cursor: grab;
  overflow: hidden;
  transition:
    width 0.28s ease,
    transform 0.22s ease,
    box-shadow 0.22s ease,
    opacity 0.22s ease;
  display: flex;
  flex-direction: column;
  touch-action: none;
  backdrop-filter: blur(8px);
}

.stock-card:active {
  cursor: grabbing;
}

.stock-card.is-expanded {
  height: max-content;
  width: 500px;
  background: rgba(255, 255, 255, 0.72);
  opacity: 1;
  transform: none;
}

.stock-card:not(.is-expanded) .expanded-wrapper {
  display: none;
}

.stock-card.is-snapped {
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
}

.watchlist-mini-panel {
  display: flex;
  flex-direction: column;
  background: transparent;
}

.watchlist-mini-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 20px;
  padding: 0 2px 0 8px;
}

.watchlist-mini-title {
  min-width: 0;
  overflow: hidden;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watchlist-mini-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.watchlist-mini-control {
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
}

.watchlist-mini-control:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.watchlist-mini-control.close:hover {
  background: #ef4444;
  color: #ffffff;
}

.watchlist-mini-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  text-align: left;
}

.watchlist-mini-row:hover,
.watchlist-mini-row.active {
  background: rgba(255,255,255,0.6);
}

.mini-stock-name {
  min-width: 0;
  overflow: hidden;
  color: rgba(0,0,0,0.8);
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-stock-percent {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
}

.minimal-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 8px;
  font-size: 12px;
  cursor: pointer;
}

.stock-name {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}

.stock-top-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.stock-top-metric {
  font-size: 12px;
  white-space: nowrap;
}

.stock-top-avg {
  color: #f5a623;
}

.stock-top-latest {
  color: #1890ff;
}

.stock-percent {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.3s ease;
}

.expanded-wrapper {
  flex: 1;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s ease 0.1s;
  position: relative;
}

.is-expanded .expanded-wrapper {
  opacity: 1;
  transform: translateY(0);
}

.floating-tooltip {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 6px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  pointer-events: none;
  z-index: 10;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.floating-tooltip.visible {
  opacity: 1;
  transform: translateY(0);
}

.tooltip-time {
  color: #666;
  font-size: 12px;
}

.tooltip-price {
  min-width: 100px;
  max-width: 120px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  .tooltip-label {
    color: #666;
  }
}

.tooltip-price.avg {
  color: #f5a623;
}

.tooltip-volume,
.tooltip-amount {
  display: flex;
  gap: 6px;
  align-items: baseline;
  color: #475569;
  font-size: 12px;
  .tooltip-label {
    color: #666;
  }
}

.chart-container {
  height: 350px;
  width: 100%;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
  position: relative;
  overflow: visible;
}

.volume-divider {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(15, 23, 42, 0.12);
  pointer-events: none;
  z-index: 5;
}

.price-axis-overlay,
.percent-axis-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}

.price-axis-label,
.percent-axis-label {
  position: absolute;
  transform: translateY(-50%);
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9),
    0 -1px 0 rgba(255, 255, 255, 0.9);
  white-space: nowrap;
}

.price-axis-label {
  left: 3px;
  padding-right: 6px;
}

.percent-axis-label {
  right: 3px;
  padding-left: 6px;
}

.up {
  color: #f23645;
}

.up.stock-percent {
  background: rgba(242, 54, 69, 0.12);
}

.down {
  color: #089981;
}

.down.stock-percent {
  background: rgba(8, 153, 129, 0.12);
}

.flat {
  color: #758696;
}

.flat.stock-percent {
  background: rgba(117, 134, 150, 0.12);
}
</style>
