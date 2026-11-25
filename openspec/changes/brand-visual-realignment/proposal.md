# Proposal

## Why

现有代码是旧的「未央」单人作品集概念稿（暗色烛光基调、半剪影舞者、禁用语汇如"残照/妖冶/不肯醒来的夜"），与 `docs/00-众芳图设计指南.md` v2 定案基线（品牌「众芳图」、纸绢明亮基调、人物志×慢关系产品模型）存在**系统性根级偏差**。代码与语义基线完全反向，任何功能开发前必须先完成视觉与品牌的对齐，否则后续变更会继续在错误的基底上叠加复杂度。

本变更解决这个"基底翻转"问题——把站点从"未央·古典舞作品集"改到"众芳图·不以无人而不芳"的轨道上，同时把色彩令牌体系从手写 CSS 过渡到 Tailwind v4 + @nuxt/ui v4 原生能力驱动的模式。

## What Changes

### 色彩令牌体系（一次性推翻，明/暗双模式）

- **BREAKING** 移除当前 `@theme static` 中的 `ink-*`（11 阶）、`rouge-*`（11 阶）、`gold-*`（7 阶）共 29 个变量，以及 main.css 与模板中全部硬编码色值。
- 预置**明/暗两套色彩方案**，默认明亮模式（纸绢 `#F7F3E9` 底），两模式共享同一套令牌名，通过 `.dark` 作用域覆盖取值：
  - 明亮模式：设计指南 §15.2 九色体系 —— `paper` / `paper-deep` / `ink` / `ink-soft` / `dai` / `tianqing` / `ouhe` / `xiang` / `zhu`。
  - 暗色模式：基于同一语义重新设计取值（不复用现有胭脂暗红系），具体色值在 design.md 定稿后写入 §15.2。
- **最大化使用 Tailwind v4 + @nuxt/ui v4 内建能力**：
  - 单值令牌走 `@theme static { --color-paper / --color-ink / --color-dai ... }`，模板直接用 `bg-paper`、`text-ink`、`border-xiang`，不写自定义 CSS 类。
  - **朱砂 `zhu` 额外提供完整 11 阶色阶（50–950）**，因为 `@nuxt/ui` 的 `primary` 会生成 `bg-primary-500`、`text-primary-600`、`ring-primary-500` 等类，必须有全阶变量存在；建议 `#B93B34` 落在 600，其余阶在 design.md 派生。
  - `app.config.ts` 设 `ui.colors.primary = 'zhu'`，CTA/按钮/焦点环自动获得朱砂色，不写任何自定义按钮样式。
  - `neutral` 暂时保留 `stone`，是否换成暖灰自定义阶在 design.md 给结论。
  - 暗色仅覆盖变量值（`.dark { --color-paper: ...; }`），不新增第二套 token 名。
- **模板类名全量映射**：`ink-*/rouge-*/gold-*` utility 共 35 处（main.css 29 处、app.vue 6 处，含 `bg-ink-950/95`、`border-gold-400/15`、`hover:text-gold-300`），全部改到新令牌。
- **纸绢颗粒层重标定**：`body::before` 现为 `opacity: .05 + mix-blend-mode: overlay`，按暗底调的，亮底下会发脏；需重新标定透明度与混合模式。

### Hero 层（禁用元素清除 + 纯文本织纹重构）

- **移除**：烛光光锥 `.hero-beam` + `@keyframes hero-beam`
- **移除**：飘落花瓣 `.hero-petal` + `@keyframes hero-petal-fall`
- **移除**：凤钗装饰 `.hero-hairpin`（含 shaft/head/drop 三个子元素）+ `@keyframes hero-hairpin-pulse`
- **移除**：暗场半剪影 hero 背景图（heroImage）及其 `@keyframes hero-drift`
- **保留并降级**：金线水袖 `.hero-sleeve` 保留形态，移除 `@keyframes hero-sleeve-glow` 发光动画，改为**缃色静态细线**，并入经纬织纹体系
- **保留**：`.hero-frame` 四角框、`.hero-vertical` 竖排容器、`.hero-scroll` 卷容器（**温庭筠艳诗文本不动**，仅调整色彩与样式）
- **新增 Hero 基底**：纯文本 + 经纬织纹 CSS 底 + 卷首题签 + slogan，用 Tailwind utility 配合少量 `repeating-linear-gradient` 实现织纹，不用照片

### 品牌与 SEO（全面改写）

| 位置 | 现状 | 目标 |
|------|------|------|
| `BrandSeal.vue` | 印章「未央」 | 「众芳图」 |
| `app.vue` header 品牌 | 「未央 / WEIYANG」 | 「众芳图 / ZHONGFANGTU」 |
| `app.vue` document title | 「未央 · 古典舞与东方影像作品集」 | 「众芳图 · 不以无人而不芳」 |
| `app.vue` description | 「…妖冶的东方叙事」 | 「众芳图，一部由她们自己落笔的长卷。」 |
| `app.vue` footer | 「© 年份 未央工作室 · WEIYANG STUDIO」 | 「© 年份 众芳图 · 众芳图志」 |
| `index.vue` Hero h1 | 「未央」 | 「众芳图」 |
| `index.vue` hero-vertical | 「烛影摇红·丝弦未歇」 | 「不以无人而不芳」 |
| `useSeoMeta` | 未央品牌语义 | title/description/ogTitle/ogDescription 全部重写 |
| `htmlAttrs.class` | `dark` | 明亮模式（由 colorMode 接管） |

- **导航改为首页锚点**（本变更不依赖路由）：`卷首 #top` / `花信 #huaxin` / `相地 #xiangdi` / `立基 #liji` / `借景 #jiejing` / `题名 #timing`。四工序锚点指向首页"四入口"区内的对应卡片，Phase 2 再升级为 `/xiangdi` 等真实路由。
- **skip-link** 目标从 `#works` 改为 `#main`（`#works` 锚点将被移除）。
- footer 品牌文案与联络信息同步更新。

### 文案语义（逐条清洗）

- 移除/改写禁用词：「不肯醒来的夜」「旧梦」「残照」「夜宴」「丝弦未歇」「sultry」「妖冶」。
- Hero lede 与各 section 文案改为第一人称、主动语态，对齐 §16.1。
- 图片生成 prompt 中移除 `sultry / mysterious / half silhouette / candlelight / half of the face in shadow` 等禁用表述。
- **已知例外**：`hero-scroll` 内温庭筠艳诗按决策暂时保留原文本，仅调样式与色彩；在 tasks 中标注为"内容阶段处理"，不视为本次视觉变更的违规项。

### 页面结构（保留骨架，换内容）

- **保留**：所有 `<section>` 容器、`IntersectionObserver` 显现逻辑（`data-reveal` / `.reveal` / `.is-visible`）、skip-link、footer 结构、`.container-edge` 栅格、`prefers-reduced-motion` 降级、639px 移动端断点。
- **重排**：首页按 §13.3 六段结构 —— 卷首 → 本期花信 → 四个入口（相地/立基/借景/题名）→ 九州索引（8–12 区，空缺显式标注）→ 如何参与（四条路径）→ 编辑准则（公开"我们不做什么"）。
- **图片资产复用**：现有 5 张作品图转为「本期花信」主图（1 张）+「人物卷」预览占位（4 张），不新增图片资源；`works[]` 数据结构改为占位卷数据（题名/人名/地区），仅为 Phase 2 真实数据预留形状。

### 文档修订

- 直接修订 `docs/00-众芳图设计指南.md` §15.2：把"v2 建议值（替换现有暗色体系）"改写为**明/暗双套令牌表**，补入暗色模式色值与用色比例；同步检查 §15.6 反面清单是否需要补"明亮模式禁用项"。

### 工程与交付

- `nuxt.config.ts`：`ui.colorMode: false` → `true`，启用明/暗切换；提供切换入口（`UColorModeButton`）。`@nuxtjs/color-mode@4.0.1` 已作为 `@nuxt/ui` 传递依赖存在于 lockfile，**无新增依赖**。
- `.github/workflows/ci.yml`：补 `pnpm generate` 步骤，对齐 `openspec/config.yaml` 声明的交付门槛（lint + typecheck + generate）。
- **GitHub Pages 静态导出**：baseURL `/wyg/`、Nitro preset `github_pages`、`routeRules` 均不变；无服务端逻辑，无新增包、图片或字体资源。启用 colorMode 后需验证静态首屏无明暗闪烁（@nuxtjs/color-mode 注入的 head script 在 SSG 下的行为）。
- **构建体积**：删除 29 个旧色阶变量 + 4 组 keyframes + 约 200 行禁用元素样式，新增 9 个单值令牌 + 11 阶朱砂色阶，CSS 体积基本持平或略减。

## Capabilities

### New Capabilities

- `visual-system`：明/暗双模式色彩令牌体系（Tailwind v4 + @nuxt/ui v4 驱动）、朱砂色阶与单值令牌的命名规约、组件层样式规则、禁用元素清单、动效规范与 prefers-reduced-motion 降级策略
- `brand-identity`：品牌名「众芳图」及命名体系（副名/slogan/精神文案）、印章组件语义、SEO 元信息模板、导航与栏目骨架、文案禁用词清单与写作规约

### Modified Capabilities

（无现有 capabilities，本项目 OpenSpec specs 为空）

## Impact

| 区域 | 文件 | 改动类型 |
|------|------|---------|
| 色彩令牌 | `app/assets/css/main.css` | **BREAKING** 重写 `@theme static`（29 变量 → 9 单值 + 11 阶朱砂）、所有硬编码色值、颗粒层参数 |
| Hero 层 | `app/assets/css/main.css` | 删除 beam/hairpin/petal 样式与 4 组 keyframes + hero-drift；water sleeve 降级为静态细线 |
| Hero 层 | `app/pages/index.vue` | 重构卷首区，移除 heroImage 与禁用装饰层，新增织纹底与题签 |
| 品牌 | `app/components/BrandSeal.vue` | 印章文字改「众芳图」 |
| 品牌/SEO/导航 | `app/app.vue` | 品牌名、三处标题、导航锚点、skip-link、footer 全部改写 |
| 主题接入 | `app/app.config.ts` | `ui.colors.primary`：`rouge` → `zhu`；`neutral` 待定 |
| 页面结构 | `app/pages/index.vue` | 按 §13.3 六段重排；5 张图片转为花信主图 + 人物卷占位 |
| 文案 | `app/pages/index.vue` + `app/app.vue` | 按 §16 重写；温庭筠艳诗标注为例外保留 |
| 文档 | `docs/00-众芳图设计指南.md` | §15.2 改为明/暗双套令牌；§15.6 复核 |
| nuxt 配置 | `nuxt.config.ts` | `ui.colorMode: false` → `true` |
| CI | `.github/workflows/ci.yml` | 补 `pnpm generate` |
