<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { SearchIcon } from "./panelIcons";
import { fetchMarketQuotes, type MarketQuote } from "./quoteApi";
import { searchStocks, type StockSearchResult } from "./stockSearch";
import WatchlistContextMenu from "./WatchlistContextMenu.vue";
import {
  DeleteOutlined,
  EditOutlined,
  PlusCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons-vue";
import {
  DEFAULT_WATCHLIST_GROUP,
  getWatchlist,
  getWatchlistGroups,
  normalizeWatchlist,
  normalizeWatchlistGroups,
  saveWatchlist,
  saveWatchlistGroups,
  toWatchlistStock,
  WATCHLIST_GROUPS_STORAGE_KEY,
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
const watchlistGroups = ref<string[]>([]);
const quoteBySecid = ref<Record<string, MarketQuote>>({});
const searchText = ref("");
const searchOptions = ref<AutoCompleteOption[]>([]);
const optionByValue = ref<Record<string, StockSearchResult>>({});
const isLoading = ref(true);
const isSearching = ref(false);
const isRefreshing = ref(false);
const hasError = ref(false);
const lastUpdatedAt = ref<number | null>(null);
const draggedSecid = ref<string | null>(null);
const dragOverSecid = ref<string | null>(null);
const activeGroup = ref("__all__");
const contextMenu = ref({
  open: false,
  secid: "",
  x: 0,
  y: 0,
});
const noteModalOpen = ref(false);
const noteDraft = ref("");
const noteTargetSecid = ref("");
const groupManagerOpen = ref(false);
const newGroupName = ref("");
const editingGroupName = ref("");
const editingGroupDraft = ref("");

let searchController: AbortController | null = null;
let quoteController: AbortController | null = null;
let refreshTimer: ReturnType<typeof window.setInterval> | null = null;
let searchSerial = 0;
let sortStartY = 0;
let sortInitialOrder: string[] = [];
let sortHasMoved = false;
let suppressNextRowClick = false;
let suppressRowClickTimer: ReturnType<typeof window.setTimeout> | null = null;

const getStockGroup = (stock: WatchlistStock) =>
  stock.group?.trim() || DEFAULT_WATCHLIST_GROUP;

const stockGroupNames = computed(() =>
  Array.from(new Set(watchlist.value.map(getStockGroup))),
);
const groupNames = computed(() =>
  normalizeWatchlistGroups([...watchlistGroups.value, ...stockGroupNames.value]),
);
const groupCountByName = computed(() =>
  Object.fromEntries(
    groupNames.value.map((group) => [
      group,
      watchlist.value.filter((stock) => getStockGroup(stock) === group).length,
    ]),
  ),
);
const displayedWatchlist = computed(() =>
  activeGroup.value === "__all__"
    ? watchlist.value
    : watchlist.value.filter((stock) => getStockGroup(stock) === activeGroup.value),
);
const watchlistRows = computed(() =>
  displayedWatchlist.value.map((stock) => ({
    stock,
    quote: quoteBySecid.value[stock.secid],
  })),
);
const contextMenuStockIndex = computed(() =>
  displayedWatchlist.value.findIndex(
    (stock) => stock.secid === contextMenu.value.secid,
  ),
);
const contextMenuStock = computed(() =>
  watchlist.value.find((stock) => stock.secid === contextMenu.value.secid) ??
  null,
);
const canMoveContextStockTop = computed(() => contextMenuStockIndex.value > 0);
const canMoveContextStockBottom = computed(
  () =>
    contextMenuStockIndex.value >= 0 &&
    contextMenuStockIndex.value < displayedWatchlist.value.length - 1,
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
    watchlistGroups.value = await getWatchlistGroups();
    watchlist.value = await getWatchlist();
    ensureActiveGroupExists();
    await loadQuotes();
  } finally {
    isLoading.value = false;
  }
};

const persistWatchlist = async (nextWatchlist: WatchlistStock[]) => {
  watchlist.value = await saveWatchlist(nextWatchlist);
  ensureActiveGroupExists();
  await loadQuotes();
};

const persistGroups = async (groups: string[]) => {
  watchlistGroups.value = await saveWatchlistGroups(groups);
  ensureActiveGroupExists();
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

const updateStock = async (
  stock: WatchlistStock,
  patch: Partial<Pick<WatchlistStock, "group" | "note">>,
) => {
  await persistWatchlist(
    watchlist.value.map((item) =>
      item.secid === stock.secid ? { ...item, ...patch } : item,
    ),
  );
};

const reindexWatchlist = (items: WatchlistStock[]) =>
  items.map((stock, index) => ({
    ...stock,
    addedAt: index + 1,
  }));

const reorderWatchlistStock = (sourceSecid: string, targetSecid: string) => {
  if (sourceSecid === targetSecid) return false;
  const sourceIndex = watchlist.value.findIndex(
    (stock) => stock.secid === sourceSecid,
  );
  const targetIndex = watchlist.value.findIndex(
    (stock) => stock.secid === targetSecid,
  );
  if (sourceIndex < 0 || targetIndex < 0) return false;

  const nextWatchlist = [...watchlist.value];
  const [sourceStock] = nextWatchlist.splice(sourceIndex, 1);
  nextWatchlist.splice(targetIndex, 0, sourceStock);
  watchlist.value = reindexWatchlist(nextWatchlist);
  return true;
};

const moveStockToEdge = async (stock: WatchlistStock, edge: "top" | "bottom") => {
  const sourceIndex = watchlist.value.findIndex(
    (item) => item.secid === stock.secid,
  );
  if (sourceIndex < 0) return;

  const nextWatchlist = [...watchlist.value];
  const [sourceStock] = nextWatchlist.splice(sourceIndex, 1);
  const peerSecids = displayedWatchlist.value
    .filter((item) => item.secid !== stock.secid)
    .map((item) => item.secid);

  if (peerSecids.length === 0) {
    nextWatchlist.splice(sourceIndex, 0, sourceStock);
    return;
  }

  if (edge === "top") {
    const targetIndex = nextWatchlist.findIndex(
      (item) => item.secid === peerSecids[0],
    );
    nextWatchlist.splice(Math.max(0, targetIndex), 0, sourceStock);
  } else {
    const targetIndex = nextWatchlist.findIndex(
      (item) => item.secid === peerSecids[peerSecids.length - 1],
    );
    nextWatchlist.splice(targetIndex + 1, 0, sourceStock);
  }

  await persistWatchlist(reindexWatchlist(nextWatchlist));
};

const closeContextMenu = () => {
  contextMenu.value = {
    ...contextMenu.value,
    open: false,
  };
};

const handleDocumentClick = () => {
  if (!contextMenu.value.open) return;
  closeContextMenu();
};

const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  closeContextMenu();
};

const openContextMenu = (event: MouseEvent, stock: WatchlistStock) => {
  event.preventDefault();
  contextMenu.value = {
    open: true,
    secid: stock.secid,
    x: Math.min(event.clientX, window.innerWidth - 128),
    y: Math.min(event.clientY, window.innerHeight - 116),
  };
};

const moveContextStockTop = async () => {
  const stock = contextMenuStock.value;
  closeContextMenu();
  if (!stock) return;
  await moveStockToEdge(stock, "top");
};

const moveContextStockBottom = async () => {
  const stock = contextMenuStock.value;
  closeContextMenu();
  if (!stock) return;
  await moveStockToEdge(stock, "bottom");
};

const removeContextStock = async () => {
  const stock = contextMenuStock.value;
  closeContextMenu();
  if (!stock) return;
  await removeStock(stock);
};

const editContextStockNote = () => {
  const stock = contextMenuStock.value;
  closeContextMenu();
  if (!stock) return;
  noteTargetSecid.value = stock.secid;
  noteDraft.value = stock.note ?? "";
  noteModalOpen.value = true;
};

const saveNote = async () => {
  const stock = watchlist.value.find(
    (item) => item.secid === noteTargetSecid.value,
  );
  if (!stock) return;

  await updateStock(stock, {
    note: noteDraft.value.trim() || undefined,
  });
  noteModalOpen.value = false;
};

const moveContextStockGroup = async (group: string) => {
  const stock = contextMenuStock.value;
  closeContextMenu();
  if (!stock) return;
  await updateStock(stock, { group });
  activeGroup.value = group;
};

const openGroupManager = () => {
  groupManagerOpen.value = true;
  newGroupName.value = "";
  editingGroupName.value = "";
  editingGroupDraft.value = "";
};

const addGroup = async () => {
  const group = newGroupName.value.trim();
  if (!group) return;
  if (groupNames.value.includes(group)) {
    void message.info(`${group} 已存在`);
    return;
  }

  await persistGroups([...groupNames.value, group]);
  activeGroup.value = group;
  newGroupName.value = "";
};

const startEditGroup = (group: string) => {
  editingGroupName.value = group;
  editingGroupDraft.value = group;
};

const cancelEditGroup = () => {
  editingGroupName.value = "";
  editingGroupDraft.value = "";
};

const saveEditedGroup = async () => {
  const oldGroup = editingGroupName.value;
  const nextGroup = editingGroupDraft.value.trim();
  if (!oldGroup || !nextGroup) return;
  if (nextGroup !== oldGroup && groupNames.value.includes(nextGroup)) {
    void message.info(`${nextGroup} 已存在`);
    return;
  }

  const nextGroups = groupNames.value.map((group) =>
    group === oldGroup ? nextGroup : group,
  );
  const nextWatchlist = watchlist.value.map((stock) =>
    getStockGroup(stock) === oldGroup ? { ...stock, group: nextGroup } : stock,
  );

  watchlistGroups.value = await saveWatchlistGroups(nextGroups);
  watchlist.value = await saveWatchlist(nextWatchlist);
  activeGroup.value = activeGroup.value === oldGroup ? nextGroup : activeGroup.value;
  cancelEditGroup();
};

const removeGroup = async (group: string) => {
  const nextGroups = groupNames.value.filter((item) => item !== group);
  const nextWatchlist = watchlist.value.map((stock) =>
    getStockGroup(stock) === group
      ? { ...stock, group: DEFAULT_WATCHLIST_GROUP }
      : stock,
  );

  watchlistGroups.value = await saveWatchlistGroups(nextGroups);
  watchlist.value = await saveWatchlist(nextWatchlist);
  if (activeGroup.value === group) {
    activeGroup.value = DEFAULT_WATCHLIST_GROUP;
  }
};

const selectGroup = (group: string) => {
  activeGroup.value = group;
};

const ensureActiveGroupExists = () => {
  if (activeGroup.value === "__all__") return;
  if (groupNames.value.includes(activeGroup.value)) return;
  activeGroup.value = "__all__";
};

const suppressFollowingRowClick = () => {
  suppressNextRowClick = true;
  if (suppressRowClickTimer !== null) {
    window.clearTimeout(suppressRowClickTimer);
  }
  suppressRowClickTimer = window.setTimeout(() => {
    suppressNextRowClick = false;
    suppressRowClickTimer = null;
  }, 250);
};

const handleRowClick = (stock: WatchlistStock) => {
  if (suppressNextRowClick) {
    suppressNextRowClick = false;
    if (suppressRowClickTimer !== null) {
      window.clearTimeout(suppressRowClickTimer);
      suppressRowClickTimer = null;
    }
    return;
  }

  emit("select", stock);
};

const hasSortOrderChanged = () =>
  sortInitialOrder.length === watchlist.value.length &&
  watchlist.value.some((stock, index) => stock.secid !== sortInitialOrder[index]);

const findStockRowAtPoint = (event: PointerEvent | MouseEvent) => {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(".stock-row");
};

const handleSortMove = (event: PointerEvent | MouseEvent) => {
  const sourceSecid = draggedSecid.value;
  if (!sourceSecid) return;

  if (!sortHasMoved && Math.abs(event.clientY - sortStartY) <= 6) return;
  sortHasMoved = true;
  suppressFollowingRowClick();
  event.preventDefault();

  const targetSecid = findStockRowAtPoint(event)?.dataset.secid;
  if (!targetSecid || targetSecid === sourceSecid) return;

  dragOverSecid.value = targetSecid;
  reorderWatchlistStock(sourceSecid, targetSecid);
};

const handleSortPointerMove = (event: PointerEvent) => {
  handleSortMove(event);
};

const handleSortMouseMove = (event: MouseEvent) => {
  handleSortMove(event);
};

const handleSortEnd = () => {
  const shouldPersist = sortHasMoved && hasSortOrderChanged();
  if (sortHasMoved) {
    suppressFollowingRowClick();
  }
  draggedSecid.value = null;
  dragOverSecid.value = null;
  sortHasMoved = false;
  document.removeEventListener("pointermove", handleSortPointerMove);
  document.removeEventListener("pointerup", handleSortPointerUp);
  document.removeEventListener("mousemove", handleSortMouseMove);
  document.removeEventListener("mouseup", handleSortMouseUp);

  if (shouldPersist) {
    void persistWatchlist(watchlist.value);
  }
};

const handleSortPointerUp = () => {
  handleSortEnd();
};

const handleSortMouseUp = () => {
  handleSortEnd();
};

const beginSort = (clientY: number, stock: WatchlistStock) => {
  draggedSecid.value = stock.secid;
  dragOverSecid.value = null;
  sortStartY = clientY;
  sortInitialOrder = watchlist.value.map((item) => item.secid);
  sortHasMoved = false;
};

const handleSortPointerDown = (event: PointerEvent, stock: WatchlistStock) => {
  if (event.button !== 0) return;
  beginSort(event.clientY, stock);
  document.addEventListener("pointermove", handleSortPointerMove);
  document.addEventListener("pointerup", handleSortPointerUp);
};

const handleSortMouseDown = (event: MouseEvent, stock: WatchlistStock) => {
  if (event.button !== 0 || draggedSecid.value) return;
  beginSort(event.clientY, stock);
  document.addEventListener("mousemove", handleSortMouseMove);
  document.addEventListener("mouseup", handleSortMouseUp);
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
    void message.warning("暂时没有查到匹配股票");
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
  if (nextValue) {
    watchlist.value = normalizeWatchlist(nextValue);
    ensureActiveGroupExists();
    void loadQuotes();
  }

  const nextGroups = changes[WATCHLIST_GROUPS_STORAGE_KEY]?.newValue;
  if (nextGroups) {
    watchlistGroups.value = normalizeWatchlistGroups(nextGroups);
    ensureActiveGroupExists();
  }
};

onMounted(() => {
  void loadWatchlist();
  refreshTimer = window.setInterval(() => {
    void loadQuotes();
  }, 15000);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);

  if (typeof chrome !== "undefined") {
    chrome.storage?.onChanged?.addListener(handleStorageChange);
  }
});

onUnmounted(() => {
  searchController?.abort();
  quoteController?.abort();
  document.removeEventListener("pointermove", handleSortPointerMove);
  document.removeEventListener("pointerup", handleSortPointerUp);
  document.removeEventListener("mousemove", handleSortMouseMove);
  document.removeEventListener("mouseup", handleSortMouseUp);
  if (suppressRowClickTimer !== null) {
    window.clearTimeout(suppressRowClickTimer);
    suppressRowClickTimer = null;
  }
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("keydown", handleDocumentKeydown);
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

    <a-modal
      v-model:open="noteModalOpen"
      title="编辑备注"
      ok-text="保存"
      cancel-text="取消"
      width="360px"
      @ok="saveNote"
    >
      <a-textarea
        v-model:value="noteDraft"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        maxlength="80"
        placeholder="输入备注，例如：等回踩、观察业绩、核心仓位"
      />
    </a-modal>

    <a-modal
      v-model:open="groupManagerOpen"
      title="分组管理"
      :footer="null"
      width="360px"
    >
      <div class="group-manager">
        <div v-for="group in groupNames" :key="group" class="group-manager-row">
          <UnorderedListOutlined class="group-drag-icon" />
          <template v-if="editingGroupName === group">
            <a-input
              v-model:value="editingGroupDraft"
              size="small"
              maxlength="12"
              @press-enter="saveEditedGroup"
            />
            <button type="button" @click="saveEditedGroup">保存</button>
            <button type="button" @click="cancelEditGroup">取消</button>
          </template>
          <template v-else>
            <span>{{ group }}</span>
            <button
              class="group-icon-button"
              type="button"
              title="编辑分组"
              @click="startEditGroup(group)"
            >
              <EditOutlined />
            </button>
            <button
              class="group-icon-button danger"
              type="button"
              title="删除分组"
              @click="removeGroup(group)"
            >
              <DeleteOutlined />
            </button>
          </template>
        </div>
        <div class="group-create-row">
          <a-input
            v-model:value="newGroupName"
            size="small"
            maxlength="12"
            placeholder="新建分组"
            @press-enter="addGroup"
          />
          <button type="button" @click="addGroup">
            <PlusCircleOutlined />
            新建分组
          </button>
        </div>
      </div>
    </a-modal>

    <a-skeleton v-if="isLoading" active :paragraph="{ rows: 7 }" />

    <div v-else-if="watchlist.length === 0" class="empty-state">
      <SearchIcon />
      <strong>暂无自选股</strong>
      <span>点击右上角搜索按钮添加第一只股票</span>
    </div>

    <template v-else>
      <div class="group-tabs">
        <button
          type="button"
          :class="{ active: activeGroup === '__all__' }"
          @click="selectGroup('__all__')"
        >
          全部
          <span>{{ watchlist.length }}</span>
        </button>
        <button
          v-for="group in groupNames"
          :key="group"
          type="button"
          :class="{ active: activeGroup === group }"
          @click="selectGroup(group)"
        >
          {{ group }}
          <span>{{ groupCountByName[group] }}</span>
        </button>
        <button
          class="group-manage-button"
          type="button"
          title="分组管理"
          @click="openGroupManager"
        >
          <EditOutlined />
        </button>
      </div>

    <div class="watchlist">
      <article
        v-for="{ stock, quote } in watchlistRows"
        :key="stock.secid"
        class="stock-row"
        :class="{
          dragging: draggedSecid === stock.secid,
          'drag-over': dragOverSecid === stock.secid,
        }"
        :data-secid="stock.secid"
        role="button"
        tabindex="0"
        @click="handleRowClick(stock)"
        @contextmenu="openContextMenu($event, stock)"
        @keydown.enter="emit('select', stock)"
      >
        <button
          class="drag-handle"
          type="button"
          title="拖拽排序"
          @click.stop
          @keydown.stop
          @pointerdown.stop="handleSortPointerDown($event, stock)"
          @mousedown.stop="handleSortMouseDown($event, stock)"
        >
          <UnorderedListOutlined />
        </button>

        <div class="stock-left">
          <div class="stock-name-line">
            <strong>{{ quote?.name ?? stock.name }}</strong>
            <span>{{ formatCode(quote ?? stock) }}</span>
          </div>
          <div class="stock-meta" :class="{ note: !!stock.note }">
            {{ stock.note || `成交量 ${formatLargeNumber(quote?.volume)}` }}
          </div>
        </div>

        <div class="stock-extra">
          <span>成交额 {{ formatLargeNumber(quote?.amount) }}</span>
          <span>市值 {{ formatLargeNumber(quote?.marketValue) }}</span>
        </div>

        <div class="stock-right">
          <div class="stock-price" :class="getTrendClass(quote?.percent)">
            {{ formatPrice(quote?.price) }}
          </div>
          <div class="stock-change" :class="getTrendClass(quote?.percent)">
            {{ formatSignedNumber(quote?.change) }}
            ({{ formatSignedPercent(quote?.percent) }})
          </div>
        </div>

      </article>
    </div>
    </template>

    <WatchlistContextMenu
      :open="contextMenu.open"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :groups="groupNames"
      :current-group="contextMenuStock ? getStockGroup(contextMenuStock) : ''"
      :can-move-top="canMoveContextStockTop"
      :can-move-bottom="canMoveContextStockBottom"
      @top="moveContextStockTop"
      @bottom="moveContextStockBottom"
      @edit-note="editContextStockNote"
      @move-group="moveContextStockGroup"
      @remove="removeContextStock"
    />

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

.group-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 7px;
  border-bottom: 1px solid #e5e7eb;
  overflow-x: auto;
}

.group-tabs button {
  height: 28px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
}

.group-tabs button:hover,
.group-tabs button.active {
  background: #eef2ff;
  color: #4f46e5;
}

.group-tabs span {
  color: inherit;
  font-size: 11px;
  opacity: 0.72;
}

.group-tabs .group-manage-button {
  width: 28px;
  justify-content: center;
  padding: 0;
  margin-left: auto;
  color: #ff4d1f;
  font-size: 16px;
}

.group-manager {
  display: flex;
  flex-direction: column;
}

.group-manager-row {
  min-height: 40px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #eef2f7;
}

.group-manager-row span {
  min-width: 0;
  overflow: hidden;
  color: #111827;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-drag-icon {
  color: #64748b;
  font-size: 16px;
}

.group-manager-row button,
.group-create-row button {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #4f46e5;
  cursor: pointer;
  font-size: 12px;
}

.group-manager-row button:hover,
.group-create-row button:hover {
  background: #eef2ff;
}

.group-manager-row .group-icon-button {
  width: 28px;
  padding: 0;
  color: #ff4d1f;
  font-size: 16px;
}

.group-manager-row .group-icon-button.danger {
  color: #dc2626;
}

.group-manager-row .group-icon-button.danger:hover {
  background: #fef2f2;
}

.group-create-row button {
  color: #ff4d1f;
}

.group-create-row button svg {
  font-size: 15px;
}

.group-create-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
}

.watchlist {
  min-height: 0;
  overflow: auto;
}

.stock-row {
  position: relative;
  min-height: 52px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}

.stock-row:hover {
  background: #f8fafc;
}

.stock-row.dragging {
  opacity: 0.58;
}

.stock-row.drag-over {
  box-shadow: inset 2px 0 0 #1890ff;
}

.drag-handle {
  width: 18px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  background: #eef2f7;
  color: #374151;
}

.drag-handle svg {
  width: 18px;
  height: 18px;
}

.stock-left,
.stock-right,
.stock-extra {
  min-width: 0;
}

.stock-name-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.stock-name-line strong {
  color: #111827;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.stock-name-line span {
  color: #4b5563;
  font-size: 11px;
}

.stock-meta,
.stock-extra {
  color: #4b5563;
  font-size: 11px;
}

.stock-meta {
  margin-top: 4px;
}

.stock-meta.note {
  color: #7c3aed;
}

.stock-extra {
  display: none;
  flex-direction: column;
  gap: 3px;
  white-space: nowrap;
}

.stock-right {
  text-align: right;
}

.stock-price {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.15;
}

.stock-change {
  margin-top: 4px;
  font-size: 11px;
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

.drag-handle :deep(svg),
.stock-search :deep(svg),
.empty-state svg {
  width: 14px;
  height: 14px;
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
  padding: 6px 12px;
  border-top: 1px solid #e5e7eb;
  color: #4b5563;
  font-size: 11px;
}

.connection {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.connection i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff4d4f;
}

.connection.error i {
  background: #9ca3af;
}

.watchlist-panel.is-sidepanel .stock-row {
  grid-template-columns: 18px minmax(130px, 1fr) minmax(110px, 0.7fr) auto;
}

.watchlist-panel.is-sidepanel .stock-extra {
  display: flex;
}

@media (max-width: 520px) {
  .watchlist-panel.is-sidepanel .stock-row {
    grid-template-columns: 18px minmax(0, 1fr) auto;
  }

  .watchlist-panel.is-sidepanel .stock-extra {
    display: none;
  }
}

@media (max-width: 330px) {
  .stock-row {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .stock-right {
    grid-column: 2;
    text-align: left;
  }
}
</style>

