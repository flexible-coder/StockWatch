<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref } from "vue";
import { message } from "ant-design-vue";
import { ArrowLeftIcon } from "./panelIcons";
import {
  DEFAULT_STOCK_CONFIG,
  getStockConfig,
  normalizeStockConfig,
  parseStockInput,
  saveStockConfig,
  STOCK_CONFIG_STORAGE_KEY,
  type StockConfig,
} from "./stockConfig";
import { searchStocks, type StockSearchResult } from "./stockSearch";

type AutoCompleteOption = {
  value: string;
  label: string;
  stock: StockSearchResult;
};

const props = withDefaults(
  defineProps<{
    surface?: "popup" | "sidepanel";
    embedded?: boolean;
    showBack?: boolean;
  }>(),
  {
    surface: "popup",
    embedded: false,
    showBack: false,
  },
);

const emit = defineEmits<{
  back: [];
}>();

const config = ref<StockConfig>(DEFAULT_STOCK_CONFIG);
const searchText = ref("");
const searchOptions = ref<AutoCompleteOption[]>([]);
const optionByValue = ref<Record<string, StockSearchResult>>({});
const isLoading = ref(true);
const isSearching = ref(false);
const isSaving = ref(false);

let searchController: AbortController | null = null;
let searchSerial = 0;

const isSidepanel = computed(() => props.surface === "sidepanel");
const currentStockText = computed(
  () => `${config.value.name} ${config.value.code} / ${config.value.secid}`,
);
const refreshSeconds = computed({
  get: () => String(Math.round(config.value.tradingPollIntervalMs / 1000)),
  set: (value: string) => {
    void updateConfig({
      tradingPollIntervalMs: Number(value) * 1000,
    });
  },
});

const isAStock = (stock: Pick<StockConfig, "secid">) =>
  /^[01]\.\d{6}$/.test(stock.secid);

const formatOptionLabel = (stock: StockSearchResult) => {
  const market = stock.market ? ` ${stock.market}` : "";
  return `${stock.name} ${stock.code}${market}`;
};

const setSearchResults = (results: StockSearchResult[]) => {
  const options = results.filter(isAStock).map((stock) => ({
    value: `${stock.name} ${stock.code}`,
    label: formatOptionLabel(stock),
    stock,
  }));

  searchOptions.value = options;
  optionByValue.value = Object.fromEntries(
    options.map((option) => [option.value, option.stock]),
  );
};

const loadConfig = async () => {
  isLoading.value = true;
  try {
    config.value = await getStockConfig();
    searchText.value = `${config.value.name} ${config.value.code}`;
  } finally {
    isLoading.value = false;
  }
};

const updateConfig = async (patch: Partial<StockConfig>) => {
  isSaving.value = true;
  try {
    config.value = await saveStockConfig({
      ...config.value,
      ...patch,
    });
  } finally {
    isSaving.value = false;
  }
};

const applyStock = async (
  stock: Pick<StockConfig, "secid" | "code" | "name">,
) => {
  if (!isAStock(stock)) {
    void message.warning("网页悬浮窗暂只支持 A 股分时");
    return;
  }

  await updateConfig({
    secid: stock.secid,
    code: stock.code,
    name: stock.name,
  });
  searchText.value = `${stock.name} ${stock.code}`;
  void message.success(`已切换到 ${stock.name} (${stock.code})`);
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

    const parsedInput = parseStockInput(trimmed);
    if (parsedInput) {
      setSearchResults([
        {
          ...parsedInput,
          market: parsedInput.secid.startsWith("1.") ? "SH" : "SZ",
          type: "股票",
        },
      ]);
      return;
    }

    searchOptions.value = [];
    optionByValue.value = {};
    void message.warning("暂时没查到匹配股票，可以直接输入 6 位代码试试");
  } finally {
    if (currentSerial === searchSerial) {
      isSearching.value = false;
    }
  }
};

const handleSelect = (value: string) => {
  const stock = optionByValue.value[value];
  if (!stock) return;
  void applyStock(stock);
};

const applyCurrentInput = async (value: string) => {
  const keyword = (value ?? searchText.value).trim();
  if (!keyword) return;

  const selectedStock = optionByValue.value[keyword];
  if (selectedStock) {
    await applyStock(selectedStock);
    return;
  }

  const parsedInput = parseStockInput(keyword);
  if (parsedInput) {
    await applyStock(parsedInput);
    return;
  }

  const results = (await searchStocks(keyword)).filter(isAStock);
  if (results[0]) {
    await applyStock(results[0]);
    return;
  }

  void message.warning("没有找到对应 A 股，请换个名称或代码");
};

const resetPosition = () => {
  void updateConfig({
    position: DEFAULT_STOCK_CONFIG.position,
  });
};

const updateEnabled = (checked: boolean | string | number) => {
  void updateConfig({
    enabled: checked === true,
  });
};

const updateDefaultExpanded = (checked: boolean | string | number) => {
  void updateConfig({
    defaultExpanded: checked === true,
  });
};

const updatePositionTop = (value: number | string | null) => {
  void updateConfig({
    position: {
      ...config.value.position,
      top: Number(value) || DEFAULT_STOCK_CONFIG.position.top,
    },
  });
};

const updatePositionRight = (value: number | string | null) => {
  void updateConfig({
    position: {
      ...config.value.position,
      right: Number(value) || DEFAULT_STOCK_CONFIG.position.right,
    },
  });
};

const handleStorageChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => {
  if (areaName !== "sync") return;

  const nextValue = changes[STOCK_CONFIG_STORAGE_KEY]?.newValue as
    | Partial<StockConfig>
    | undefined;
  if (!nextValue) return;

  config.value = normalizeStockConfig(nextValue);
  searchText.value = `${config.value.name} ${config.value.code}`;
};

onMounted(() => {
  void loadConfig();
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.addListener(handleStorageChange);
  }
});

onUnmounted(() => {
  searchController?.abort();
  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.removeListener(handleStorageChange);
  }
});
</script>

<template>
  <main
    class="settings-page"
    :class="{ embedded, 'is-sidepanel': isSidepanel }"
  >
    <header class="settings-header">
      <a-button
        v-if="showBack"
        type="text"
        :icon="h(ArrowLeftIcon)"
        @click="emit('back')"
      />
      <div>
        <h1>设置</h1>
        <p>悬浮窗股票、位置与刷新频率</p>
      </div>
    </header>

    <section class="settings-content">
      <a-skeleton v-if="isLoading" active :paragraph="{ rows: 5 }" />

      <template v-else>
        <section class="settings-section">
          <div class="section-title">
            <strong>当前股票</strong>
            <a-tag :color="config.enabled ? 'blue' : 'default'">
              {{ config.enabled ? "已显示" : "已隐藏" }}
            </a-tag>
          </div>

          <div class="current-stock">
            <span>{{ currentStockText }}</span>
          </div>

          <a-auto-complete
            v-model:value="searchText"
            class="stock-search"
            :options="searchOptions"
            :filter-option="false"
            @search="handleSearch"
            @select="handleSelect"
          >
            <a-input-search
              placeholder="搜索 A 股名称 / 代码，如 贵州茅台 或 600519"
              enter-button="应用"
              :loading="isSearching || isSaving"
              @search="applyCurrentInput"
            />
          </a-auto-complete>
        </section>

        <section class="settings-section">
          <div class="setting-row">
            <div>
              <strong>显示悬浮窗</strong>
              <span>临时关闭网页内行情卡片</span>
            </div>
            <a-switch
              :checked="config.enabled"
              :loading="isSaving"
              @change="updateEnabled"
            />
          </div>

          <a-divider />

          <div class="setting-row">
            <div>
              <strong>默认展开图表</strong>
              <span>刷新页面后直接展示分时图</span>
            </div>
            <a-switch
              :checked="config.defaultExpanded"
              :loading="isSaving"
              @change="updateDefaultExpanded"
            />
          </div>

          <a-divider />

          <div class="position-grid">
            <label>
              距顶部
              <a-input-number
                :value="config.position.top"
                :min="8"
                addon-after="px"
                @change="updatePositionTop"
              />
            </label>
            <label>
              距右侧
              <a-input-number
                :value="config.position.right"
                :min="8"
                addon-after="px"
                @change="updatePositionRight"
              />
            </label>
            <a-button class="reset-button" @click="resetPosition">
              重置位置
            </a-button>
          </div>
        </section>

        <section class="settings-section">
          <div class="section-title">
            <strong>刷新频率</strong>
          </div>
          <a-radio-group
            v-model:value="refreshSeconds"
            option-type="button"
            button-style="solid"
          >
            <a-radio-button value="3">3 秒</a-radio-button>
            <a-radio-button value="5">5 秒</a-radio-button>
            <a-radio-button value="10">10 秒</a-radio-button>
            <a-radio-button value="30">30 秒</a-radio-button>
          </a-radio-group>
          <p class="hint">仅影响交易时段；非交易时段会自动降频。</p>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  color: #111827;
}

.settings-page.embedded {
  min-height: 0;
  height: 100%;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 16px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.settings-header :deep(.ant-btn) {
  width: 28px;
  height: 28px;
  padding: 0;
}

.settings-header :deep(svg) {
  width: 16px;
  height: 16px;
}

.settings-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
}

.settings-header p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.settings-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 14px;
}

.settings-section {
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.current-stock {
  display: flex;
  width: 100%;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1890ff;
  font-size: 12px;
  font-weight: 700;
}

.stock-search {
  width: 100%;
}

.hint {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-row strong,
.position-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #111827;
  font-size: 14px;
}

.setting-row span {
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
}

.position-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: end;
}

.reset-button {
  grid-column: 1 / -1;
}

@media (max-width: 380px) {
  .position-grid {
    grid-template-columns: 1fr;
  }
}
</style>
