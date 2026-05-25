# StockWatch 项目上下文

## 项目概览

StockWatch 是一个 Chrome 插件，技术栈包括 Vue 3、TypeScript、Vite、CRXJS、Ant Design Vue 和 lightweight-charts。

当前项目主要有三个展示入口：

- `src/content/views/App.vue`：注入到网页里的股票悬浮窗。当前负责展示所选股票、分时区域图、均价线、分时量、悬浮 tooltip，以及悬浮窗位置和展开状态。
- `src/popup/App.vue`：Chrome 插件弹窗入口。目前直接渲染 `StockSettingsPanel`。
- `src/sidepanel/App.vue`：Chrome 侧边栏入口。目前直接渲染 `StockSettingsPanel`。
- `src/shared/StockSettingsPanel.vue`：弹窗和侧边栏共用的配置页面，支持选择股票、控制悬浮窗显示、默认展开状态、悬浮窗位置和刷新频率。

股票配置逻辑在 `src/shared/stockConfig.ts`，数据保存在 `chrome.storage.sync`，key 为 `tickeye.stockConfig`。

股票搜索逻辑在 `src/shared/stockSearch.ts`，当前使用东方财富搜索接口。

## 常用命令

- 安装依赖：`npm install`
- 启动开发服务：`npm run dev`
- 构建插件：`npm run build`

实现功能后需要运行 `npm run build` 做基础验证。

## 当前状态

- 弹窗和侧边栏目前还不是正式的产品面板，它们都直接展示配置表单。
- 网页内的股票悬浮窗图表位于 `src/content/views/App.vue`，使用 `lightweight-charts` 实现。
- 近期分时图已有行为：
  - 分时价格线无论涨跌都使用蓝色区域图。
  - 均价线使用橙色。
  - 鼠标悬浮 tooltip 展示时间、价格、均价、涨跌幅、成交量、成交额。
  - 展开时顶部股票信息展示股票名称、橙色均价、蓝色最新价。

## 后续产品方向

弹窗 Panel 和侧边栏页面需要做成一致的产品体验。

目标行为：

1. 弹窗 Panel 默认展示主面板，而不是直接进入配置页。
2. 主面板上提供设置按钮，点击后进入配置页面。
3. 配置页面返回时，回到弹窗 Panel 主面板。
4. 侧边栏尽量复用同一套主面板和配置页切换逻辑。
5. 主面板参考用户提供的设计图：
   - 左侧为竖向菜单导航。
   - 右侧为主要内容区。
   - 顶部展示指数涨跌幅小卡片，包括指数名称、最新点位、涨跌点数和涨跌幅。
   - 底部展示自选股列表。
   - 自选股列表支持搜索股票并添加自选股。
   - 自选股行后续需要支持迷你分时图、市值、成交量、当日涨跌、年初至今、备注等信息。

## 推荐实现方案

优先抽取共享组件，不要在弹窗和侧边栏里重复写业务逻辑。

建议结构：

- `src/shared/StockPanel.vue`：弹窗和侧边栏共用的主面板容器。
- `src/shared/StockSettingsPanel.vue`：保留为配置页面，但改造成可嵌入到主面板流程中。
- `src/shared/WatchlistPanel.vue`：自选股列表和添加股票流程。
- `src/shared/MarketIndexCards.vue`：顶部指数卡片列表。
- `src/shared/panelStorage.ts`，或者扩展 `stockConfig.ts`：保存自选股和面板相关配置。

弹窗和侧边栏入口尽量保持轻量：

- `src/popup/App.vue` 渲染共享主面板，并传入 `surface="popup"`。
- `src/sidepanel/App.vue` 渲染共享主面板，并传入 `surface="sidepanel"`。

可以在 `StockPanel.vue` 内部使用本地状态控制页面，例如 `view: "main" | "settings"`。

## 数据模型建议

当前配置只支持一个被悬浮窗跟踪的股票：

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

后续自选股功能需要新增持久化列表。建议先和当前单个悬浮窗股票配置分开保存，或者明确规则：点击自选股列表某一行时，同时切换网页悬浮窗跟踪的股票。

建议后续类型：

```ts
interface WatchlistStock {
  secid: string;
  code: string;
  name: string;
  note?: string;
  addedAt: number;
}
```

建议 storage key：

- `tickeye.stockConfig`：当前网页悬浮窗配置。
- `tickeye.watchlist`：后续自选股列表。
- `tickeye.panelConfig`：后续面板 UI 偏好配置，如有需要再加。

## 设计要求

- 弹窗和侧边栏需要保持一致的视觉和交互。
- 参考图的方向是轻量、干净、自选股列表优先。
- 这是一个盯盘工具，不要做成营销页风格。优先保证信息密度、可扫读性和操作效率。
- 导航、设置、添加、编辑等操作优先使用图标按钮。
- 主面板默认不展示配置项，只有点击设置按钮后才进入配置页面。
- 添加自选股需要支持按股票名称或股票代码搜索。
- 颜色尽量沿用当前图表语言：
  - 最新价 / 价格蓝：`#1890ff`
  - 均价橙：`#f5a623`
  - 上涨红：沿用当前项目红色体系
  - 下跌绿：沿用当前项目绿色体系

## 重要文件

- `src/content/views/App.vue`：大文件，修改图表要谨慎。它负责图表绘制、hover、行情轮询和悬浮窗位置。
- `src/shared/StockSettingsPanel.vue`：当前弹窗和侧边栏配置页。搜索相关函数里有临时 `console.log`，后续重构时可以清理。
- `src/shared/stockConfig.ts`：配置归一化和存储。
- `src/shared/stockSearch.ts`：股票搜索接口和代码解析兜底。
- `manifest.config.ts`：Chrome 插件配置，包括权限、弹窗、侧边栏、content script 和东方财富接口权限。

## 后续协作注意事项

- 修改前先看 `git status --short`，不要覆盖用户已有改动。
- 搜索文件和代码优先使用 `rg` 或 `rg --files`。
- 手动编辑文件优先使用 `apply_patch`。
- 弹窗和侧边栏入口保持轻量，共享逻辑放到 `src/shared`。
- 除非用户明确要求，否则不要大范围重写 `src/content/views/App.vue` 的图表逻辑。分时图已经经历多轮 UI 调整，后续改动要尽量小，并做好视觉验证。
- 前端功能改完后运行 `npm run build`。
- 涉及弹窗和侧边栏 UI 时，需要分别检查两种宽度下的布局效果。
