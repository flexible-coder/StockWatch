<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchMarketQuotes, type MarketQuote } from "./quoteApi";

const props = defineProps<{
  refreshSignal: number;
}>();

const INDEX_SECIDS = ["1.000001", "0.399001", "0.399006"];

const quotes = ref<MarketQuote[]>([]);
const isLoading = ref(true);
const hasError = ref(false);

let fetchController: AbortController | null = null;

const quoteCards = computed(() =>
  INDEX_SECIDS.map((secid) => quotes.value.find((quote) => quote.secid === secid)),
);

const formatNumber = (value: number | null, digits = 2) =>
  value === null ? "--" : value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatSignedPercent = (value: number | null) => {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const formatSignedNumber = (value: number | null) => {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
};

const getTrendClass = (value: number | null) => {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
};

const loadIndexQuotes = async () => {
  fetchController?.abort();
  fetchController = new AbortController();
  isLoading.value = quotes.value.length === 0;
  hasError.value = false;

  try {
    quotes.value = await fetchMarketQuotes(INDEX_SECIDS, fetchController.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    hasError.value = true;
  } finally {
    isLoading.value = false;
    fetchController = null;
  }
};

onMounted(() => {
  void loadIndexQuotes();
});

watch(
  () => props.refreshSignal,
  () => {
    void loadIndexQuotes();
  },
);
</script>

<template>
  <section class="index-grid" aria-label="市场指数">
    <article
      v-for="(quote, index) in quoteCards"
      :key="INDEX_SECIDS[index]"
      class="index-card"
      :class="getTrendClass(quote?.percent ?? null)"
    >
      <a-skeleton
        v-if="isLoading && !quote"
        active
        :title="{ width: '54%' }"
        :paragraph="{ rows: 2, width: ['76%', '46%'] }"
      />
      <template v-else>
        <div class="index-name">
          {{ quote?.name ?? ["上证指数", "深证成指", "创业板指"][index] }}
        </div>
        <div class="index-price" :class="getTrendClass(quote?.percent ?? null)">
          {{ formatNumber(quote?.price ?? null) }}
        </div>
        <div class="index-change" :class="getTrendClass(quote?.percent ?? null)">
          {{ formatSignedNumber(quote?.change ?? null) }}
          {{ formatSignedPercent(quote?.percent ?? null) }}
        </div>
      </template>
    </article>
    <span v-if="hasError" class="index-error">指数更新失败</span>
  </section>
</template>

<style scoped>
.index-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 0 16px 14px;
}

.index-card {
  min-height: 68px;
  padding: 9px 10px;
  border: 1px solid rgba(220, 240, 231, 0.85);
  border-radius: 8px;
  background: #f2fbf6;
  text-align: center;
}

.index-card.up {
  border-color: rgba(248, 201, 201, 0.7);
  background: #fff5f5;
}

.index-card.down {
  border-color: rgba(188, 230, 207, 0.8);
  background: #effaf4;
}

.index-card.flat {
  border-color: #e5e7eb;
  background: #f8fafc;
}

.index-name {
  margin-bottom: 3px;
  color: #111827;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
}

.index-price {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.15;
}

.index-change {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.15;
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

.index-error {
  position: absolute;
  right: 16px;
  bottom: 2px;
  color: #9ca3af;
  font-size: 11px;
}

@media (max-width: 380px) {
  .index-grid {
    grid-template-columns: 1fr;
  }
}
</style>
