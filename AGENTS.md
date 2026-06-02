# StockWatch 项目上下文

## 项目概览

StockWatch 是一个 Chrome 插件，技术栈包括 Vue 3、TypeScript、Vite、CRXJS、Ant Design Vue 和 lightweight-charts。

当前项目主要有三个展示入口：

- `src/content/views/App.vue`：注入到网页里的股票悬浮窗。当前仍负责网页悬浮窗的位置、展开状态、hover、图表绘制和行情轮询。分时数据请求已开始复用 `src/shared/intradayApi.ts`。
- `src/popup/App.vue`：Chrome 插件弹窗入口。当前渲染共享主面板 `StockPanel`，传入 `surface="popup"`。
- `src/sidepanel/App.vue`：Chrome 侧边栏入口。当前渲染共享主面板 `StockPanel`，传入 `surface="sidepanel"`。
- `src/shared/StockPanel.vue`：弹窗和侧边栏共用的产品主面板，包含主面板、股票详情页和设置页切换逻辑。
- `src/shared/StockSettingsPanel.vue`：弹窗和侧边栏共用的设置页，支持嵌入主面板流程。
- `src/shared/WatchlistPanel.vue`：自选股列表、搜索添加、删除、设为网页悬浮窗股票。
- `src/shared/MarketIndexCards.vue`：顶部指数行情卡片。
- `src/shared/IntradayChart.vue`：可复用分时图组件，用于自选股详情页。

股票配置逻辑在 `src/shared/stockConfig.ts`，数据保存在 `chrome.storage.sync`，key 为 `tickeye.stockConfig`。

自选股列表逻辑在 `src/shared/watchlistStorage.ts`，数据保存在 `chrome.storage.sync`，key 为 `tickeye.watchlist`。

股票搜索逻辑在 `src/shared/stockSearch.ts`，当前使用东方财富搜索接口。

行情报价逻辑在 `src/shared/quoteApi.ts`，当前使用东方财富批量行情接口。

分时数据逻辑在 `src/shared/intradayApi.ts`，当前使用东方财富分时接口。

## 常用命令

- 安装依赖：`npm install`
- 启动开发服务：`npm run dev`
- 构建插件：`npm run build`

实现功能后需要运行 `npm run build` 做基础验证。

在当前 Windows 沙箱环境中，`npm run build` 或 `npm run dev` 可能因为 `spawn EPERM` 失败；如果遇到这个问题，需要按权限流程在沙箱外重新运行同一命令。

## 当前已完成功能

### 弹窗和侧边栏主面板

- popup 和 sidepanel 已经不再直接进入设置页。
- 二者共用 `src/shared/StockPanel.vue`。
- 主面板包含左侧竖向导航、右侧内容区、顶部搜索/刷新/设置图标按钮。
- 点击设置按钮进入配置页，配置页支持返回主面板。
- popup 和 sidepanel 保持同一套产品体验。

### 指数行情卡

- 顶部展示上证指数、深证成指、创业板指。
- 展示指数名称、最新点位、涨跌幅。
- 数据来自东方财富真实行情接口。

### 自选股列表

- 自选股列表展示股票名称、代码、成交量、最新价、涨跌额和涨跌幅。
- 支持按股票名称或代码搜索并添加自选股。
- 支持删除自选股。
- 支持将 A 股设为网页悬浮窗跟踪股票。
- 自选股保存到 `tickeye.watchlist`。
- 默认自选股包含设计稿中类似的样例股票，后续用户添加/删除后以 storage 为准。

### 股票详情和分时图

- 点击自选股行会进入股票详情页。
- 详情页使用 `src/shared/IntradayChart.vue` 展示分时图。
- 分时图包含蓝色价格区域线、橙色均价线和成交量柱。
- 分时数据来自 `src/shared/intradayApi.ts`。
- 网页悬浮窗的数据请求也已切到共享 `intradayApi.ts`，但图表渲染层仍保留在 `src/content/views/App.vue` 中。

### 网页悬浮窗当前行为

- 当前网页悬浮窗仍以单只股票为主。
- 支持显示股票名称、涨跌幅、展开/收起。
- 展开后显示分时价格线、均价线、成交量和 hover tooltip。
- 分时价格线无论涨跌都使用蓝色区域图。
- 均价线使用橙色。
- hover tooltip 展示时间、价格、均价、涨跌幅、成交量、成交额。

## 后续功能计划

### 1. 股票详情页增强

优先级：高。

目标是在 popup/sidepanel 的股票详情页中提供更完整的盯盘信息。

建议添加：

- 最新价、涨跌额、涨跌幅、成交量、成交额。
- 分时图上方增加基础行情摘要。
- 增加操作按钮：设为网页悬浮窗、删除自选、刷新。
- 增加图表切换入口：分时 / 日K / 周K / 月K。
- 保持信息密度，不做营销页式大卡片。

### 2. K 线图能力

优先级：高。

建议新增：

- `src/shared/klineApi.ts`：封装东方财富 K 线接口。
- `src/shared/KlineChart.vue`：复用 lightweight-charts 绘制 K 线。
- 股票详情页支持分时、日K、周K、月K切换。

实现时不要把 K 线逻辑写死在 `StockPanel.vue` 或 `WatchlistPanel.vue` 中，应放到共享 API 和共享图表组件中。

### 3. 自选股列表增强

优先级：中。

建议添加：

- 迷你分时图。
- 市值、成交额、换手率。
- 当日涨跌、年初至今。
- 股票备注。
- 拖拽排序。
- 自选股分组，例如：自选、持仓、观察。

popup 宽度有限，默认保持紧凑列表；sidepanel 宽度较大时可以展示更多列。

### 4. 数据刷新策略

优先级：中。

建议添加：

- 交易时段高频刷新。
- 非交易时段自动降频。
- 页面隐藏或插件面板不可见时暂停或降频。
- 自选股列表、指数卡、详情页图表共用刷新策略，避免多处重复轮询。

### 5. 网页悬浮窗图表组件化

优先级：中。

当前 `src/content/views/App.vue` 仍然是大文件，包含网页悬浮窗 UI、拖动/位置、图表绘制、hover 和轮询。

建议后续逐步迁移：

1. 保持 `src/content/views/App.vue` 负责网页悬浮窗容器、定位、展开状态和吸附状态。
2. 将分时图渲染逐步替换为共享 `src/shared/IntradayChart.vue`。
3. 不要一次性大范围重写，避免破坏已经稳定的分时图行为。

## 网页悬浮框后续改造计划

目标：把当前只跟踪单只股票的网页悬浮窗，改造成一个更轻量、偏隐藏、可拖动、可吸附的自选股行情小面板。

### 核心形态

- 悬浮框默认是一个长方形小面板。
- 尺寸约 `180px * 250px`。
- 面板内每一行高度约 `40px`。
- 每行左侧显示股票名称。
- 每行右侧显示涨跌幅。
- 面板最多展示 `5-6` 只股票。
- 默认展示自选股列表前 `5` 只。

### 交互行为

- 点击某一只股票后，展开查看该股票的分时图。
- 展开后的分时图行为尽量沿用当前悬浮窗逻辑：
  - 显示分时价格线。
  - 显示均价线。
  - 显示成交量。
  - 支持 hover tooltip。
  - 展示当前股票名称、最新价、均价、涨跌幅等信息。
- 点击不同股票时，分时图切换到对应股票。
- 收起后回到自选股小列表面板。

### 拖动与吸附

- 悬浮框支持自由拖动。
- 拖动结束后，如果靠近浏览器窗口边缘，自动吸附到边缘。
- 自动吸附后，面板进入更偏隐藏的状态。
- 吸附状态下可以只露出第一个股票，或者露出一个较窄的行情条。
- 用户点击或悬停后再展开完整面板。

### 偏隐藏设计方向

- 面板不要太抢网页内容。
- 默认状态尽量轻量、克制、半隐藏。
- 靠边吸附时优先保留“第一个自选股”的核心信息。
- 完整列表只在用户主动展开或交互时出现。
- UI 可以自由发挥，但整体应偏工具化、低干扰、高可扫读性。

### 数据来源

- 股票列表来自 `tickeye.watchlist`。
- 默认展示自选股前 5 只。
- 行情数据复用 `src/shared/quoteApi.ts`。
- 分时数据复用 `src/shared/intradayApi.ts`。
- 分时图后续优先复用 `src/shared/IntradayChart.vue`。

### 建议实现顺序

1. 在 `src/content/views/App.vue` 中读取 `tickeye.watchlist`。
2. 把当前单只股票悬浮窗改成自选股列表小面板。
3. 接入前 5 只自选股实时行情。
4. 点击列表项后切换当前展开股票。
5. 将当前分时图逻辑逐步替换或迁移为复用 `IntradayChart.vue`。
6. 增加拖拽定位。
7. 增加靠边自动吸附。
8. 增加吸附后的半隐藏状态。

一句话版本：后续将网页悬浮窗改造成一个约 `180x250` 的可拖拽吸附自选股小面板，默认展示自选股前 5 只，每行显示股票名称和涨跌幅；点击某只股票后展开对应分时图，吸附到边缘时进入半隐藏状态，只保留第一只股票的核心行情信息。

## 数据模型

当前网页悬浮窗配置：

```ts
interface StockConfig {
  secid: string;
  code: string;
  name: string;
  enabled: boolean;
  defaultExpanded: boolean;
  position: {
    top: number;
    right: number;
  };
  tradingPollIntervalMs: number;
}
```

当前自选股类型：

```ts
interface WatchlistStock {
  secid: string;
  code: string;
  name: string;
  note?: string;
  addedAt: number;
}
```

当前 storage key：

- `tickeye.stockConfig`：当前网页悬浮窗配置。
- `tickeye.watchlist`：自选股列表。
- `tickeye.panelConfig`：后续面板 UI 偏好配置，如有需要再加。

## 设计要求

- 弹窗和侧边栏需要保持一致的视觉和交互。
- 这是一个盯盘工具，不要做成营销页风格。
- 优先保证信息密度、可扫读性和操作效率。
- 导航、设置、添加、编辑、刷新等操作优先使用图标按钮。
- 主面板默认不展示配置项，只有点击设置按钮后才进入配置页面。
- 添加自选股需要支持按股票名称或股票代码搜索。
- 字号原则：
  - 最大字号控制在 `16px` 左右。
  - 常规正文使用 `14px`。
  - 辅助信息使用 `12px`。
  - 不要为了强调价格使用过大的数字。
- 颜色尽量沿用当前图表语言：
  - 最新价 / 价格蓝：`#1890ff`
  - 均价橙：`#f5a623`
  - 上涨红：沿用当前项目红色体系
  - 下跌绿：沿用当前项目绿色体系

## 重要文件

- `src/content/views/App.vue`：网页悬浮窗大文件，修改图表、拖动、吸附、悬浮窗状态时要谨慎。
- `src/shared/StockPanel.vue`：popup 和 sidepanel 的共享产品主面板。
- `src/shared/WatchlistPanel.vue`：自选股列表和添加股票流程。
- `src/shared/StockSettingsPanel.vue`：共享设置页。
- `src/shared/MarketIndexCards.vue`：指数卡片。
- `src/shared/IntradayChart.vue`：可复用分时图组件。
- `src/shared/intradayApi.ts`：分时数据接口和交易时间轴工具。
- `src/shared/quoteApi.ts`：批量行情接口。
- `src/shared/watchlistStorage.ts`：自选股持久化。
- `src/shared/stockConfig.ts`：网页悬浮窗配置归一化和存储。
- `src/shared/stockSearch.ts`：股票搜索接口和代码解析兜底。
- `manifest.config.ts`：Chrome 插件配置，包括权限、弹窗、侧边栏、content script 和东方财富接口权限。

## 后续协作注意事项

- 修改前先看 `git status --short`，不要覆盖用户已有改动。
- 搜索文件和代码优先使用 `rg` 或 `rg --files`。
- 手动编辑文件优先使用 `apply_patch`。
- 弹窗和侧边栏入口保持轻量，共享逻辑放到 `src/shared`。
- 除非用户明确要求，否则不要大范围重写 `src/content/views/App.vue` 的图表逻辑。
- 分时图已经经历多轮 UI 调整，后续改动要尽量小，并做好视觉验证。
- 涉及 popup/sidepanel UI 时，需要分别检查 `430x620` popup 和 `360px+` sidepanel 下的布局效果。
- 涉及网页悬浮窗 UI 时，需要检查普通网页上是否遮挡内容、是否能拖动、是否能吸附、展开图表是否正常。
- 前端功能改完后运行 `npm run build`。
