<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
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
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import {
  fetchIntradayData,
  formatAxisTimeFromMinuteIndex,
  formatMarketTimeFromMinuteIndex,
  fullTradingMinuteIndexes,
  LAST_TRADING_MINUTE_INDEX,
  syntheticTimestampToMinuteIndex,
  type IntradayData,
  type IntradayPoint,
} from "./intradayApi";

type SeriesPoint = AreaData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;
type VolumeSeriesPoint =
  | HistogramData<UTCTimestamp>
  | WhitespaceData<UTCTimestamp>;

const props = withDefaults(
  defineProps<{
    secid: string;
    height?: number;
    compact?: boolean;
    showVolume?: boolean;
    refreshSignal?: number;
  }>(),
  {
    height: 220,
    compact: false,
    showVolume: true,
    refreshSignal: 0,
  },
);

const emit = defineEmits<{
  loaded: [data: IntradayData];
}>();

const chartContainerRef = ref<HTMLDivElement | null>(null);
const data = ref<IntradayData | null>(null);
const isLoading = ref(true);
const hasError = ref(false);

let chart: IChartApi | null = null;
let priceSeries: ISeriesApi<"Area"> | null = null;
let avgSeries: ISeriesApi<"Line"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let resizeObserver: ResizeObserver | null = null;
let fetchController: AbortController | null = null;

const chartHeight = computed(() => props.height);
const points = computed(() => data.value?.points ?? []);
const preClose = computed(() => data.value?.preClose ?? 0);

const getTimestampFromTime = (time: Time | undefined): number | null => {
  if (typeof time === "number") return time;
  if (
    typeof time === "object" &&
    time !== null &&
    "timestamp" in time &&
    typeof time.timestamp === "number"
  ) {
    return time.timestamp;
  }
  return null;
};

const formatTime = (time: Time | undefined): string => {
  const timestamp = getTimestampFromTime(time);
  if (timestamp === null) return "";
  return formatAxisTimeFromMinuteIndex(syntheticTimestampToMinuteIndex(timestamp));
};

const buildFullTradingSeriesData = (
  source: IntradayPoint[],
  valueGetter: (point: IntradayPoint) => number,
): SeriesPoint[] => {
  const pointByMinuteIndex = new Map(
    source.map((point) => [point.minuteIndex, point]),
  );

  return fullTradingMinuteIndexes.map((minuteIndex) => {
    const time = minuteIndex as UTCTimestamp;
    const point = pointByMinuteIndex.get(minuteIndex);
    return point ? { time, value: valueGetter(point) } : { time };
  });
};

const buildVolumeSeriesData = (source: IntradayPoint[]): VolumeSeriesPoint[] => {
  const pointByMinuteIndex = new Map(
    source.map((point) => [point.minuteIndex, point]),
  );

  return fullTradingMinuteIndexes.map((minuteIndex) => {
    const time = minuteIndex as UTCTimestamp;
    const point = pointByMinuteIndex.get(minuteIndex);
    if (!point) return { time };

    const previousPoint = pointByMinuteIndex.get(minuteIndex - 1);
    const comparePrice = previousPoint?.value ?? preClose.value;
    const color =
      comparePrice > 0 && point.value < comparePrice ? "#16a34a" : "#f5222d";

    return {
      time,
      value: point.volume,
      color,
    };
  });
};

const fitFullRange = () => {
  if (!chart) return;
  chart.timeScale().fitContent();
  chart.timeScale().setVisibleLogicalRange({
    from: 0,
    to: LAST_TRADING_MINUTE_INDEX,
  });
};

const syncSeriesData = () => {
  const source = points.value;
  priceSeries?.setData(buildFullTradingSeriesData(source, (point) => point.value));
  avgSeries?.setData(buildFullTradingSeriesData(source, (point) => point.avgPrice));
  volumeSeries?.setData(buildVolumeSeriesData(source));
  fitFullRange();
};

const initChart = async () => {
  await nextTick();
  if (!chartContainerRef.value || chart) return;

  const width = chartContainerRef.value.clientWidth || 280;
  chart = createChart(chartContainerRef.value, {
    width,
    height: chartHeight.value,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "#9ca3af",
      fontSize: 10,
      attributionLogo: false,
    },
    localization: {
      locale: "zh-CN",
      timeFormatter: (time: Time) => {
        const timestamp = getTimestampFromTime(time);
        const minuteIndex =
          timestamp === null ? null : syntheticTimestampToMinuteIndex(timestamp);
        return minuteIndex === null
          ? ""
          : formatMarketTimeFromMinuteIndex(minuteIndex);
      },
    },
    grid: {
      vertLines: {
        visible: true,
        color: "rgba(148, 163, 184, 0.16)",
        style: LineStyle.Dotted,
      },
      horzLines: {
        visible: true,
        color: "rgba(148, 163, 184, 0.16)",
        style: LineStyle.Dotted,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: "#1890ff",
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: "#1890ff",
      },
      horzLine: {
        color: "#1890ff",
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: "#1890ff",
      },
    },
    leftPriceScale: {
      visible: false,
      scaleMargins: { top: 0.08, bottom: props.showVolume ? 0.28 : 0.08 },
    },
    rightPriceScale: {
      visible: false,
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      ticksVisible: false,
      fixLeftEdge: true,
      tickMarkFormatter: formatTime,
    },
    handleScale: false,
    handleScroll: { vertTouchDrag: false },
  });

  priceSeries = chart.addSeries(AreaSeries, {
    priceScaleId: "left",
    lineColor: "#1890ff",
    topColor: "rgba(24, 144, 255, 0.2)",
    bottomColor: "rgba(255, 255, 255, 0)",
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: !props.compact,
  });

  avgSeries = chart.addSeries(LineSeries, {
    priceScaleId: "left",
    color: "#f5a623",
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  if (props.showVolume) {
    volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.76, bottom: 0 },
    });
  }

  resizeObserver = new ResizeObserver((entries) => {
    if (!chart) return;
    for (const entry of entries) {
      const { width } = entry.contentRect;
      if (width > 0) {
        chart.applyOptions({ width, height: chartHeight.value });
        fitFullRange();
      }
    }
  });
  resizeObserver.observe(chartContainerRef.value);
  syncSeriesData();
};

const destroyChart = () => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart?.remove();
  chart = null;
  priceSeries = null;
  avgSeries = null;
  volumeSeries = null;
};

const loadData = async () => {
  fetchController?.abort();
  fetchController = new AbortController();
  isLoading.value = !data.value;
  hasError.value = false;

  try {
    const nextData = await fetchIntradayData(props.secid, fetchController.signal);
    data.value = nextData;
    emit("loaded", nextData);
    await initChart();
    syncSeriesData();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    hasError.value = true;
  } finally {
    isLoading.value = false;
    fetchController = null;
  }
};

onMounted(() => {
  void initChart();
  void loadData();
});

onUnmounted(() => {
  fetchController?.abort();
  destroyChart();
});

watch(
  () => props.secid,
  () => {
    data.value = null;
    void loadData();
  },
);

watch(
  () => props.refreshSignal,
  () => {
    void loadData();
  },
);

watch(chartHeight, () => {
  chart?.applyOptions({ height: chartHeight.value });
  fitFullRange();
});
</script>

<template>
  <div class="intraday-chart" :class="{ compact }">
    <div
      ref="chartContainerRef"
      class="chart-canvas"
      :style="{ height: `${chartHeight}px` }"
    />
    <div v-if="isLoading" class="chart-state">加载中</div>
    <div v-else-if="hasError" class="chart-state">分时数据加载失败</div>
    <div v-else-if="points.length === 0" class="chart-state">暂无分时数据</div>
  </div>
</template>

<style scoped>
.intraday-chart {
  position: relative;
  min-width: 0;
  width: 100%;
}

.chart-canvas {
  width: 100%;
  min-height: 120px;
}

.chart-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 12px;
  pointer-events: none;
}
</style>
