# Design

## Context

- 样式单点集中在 [main.css](file:///D:/Workspace/Codes/wyg/app/assets/css/main.css)（1387 行）：`@theme static` 定义 `ink-*`(11 阶) / `rouge-*`(11 阶) / `gold-*`(7 阶) 共 29 个颜色变量，另在 `@layer base`、`@layer components` 与多处 `@keyframes` 中散落硬编码色值（`#0A0608`、`#7A1536`、`#D9B878` 等）。
- Hero 是完整暗场图层栈：`.hero-media`（照片 + `hero-drift`）→ `.hero-veil`（暗色渐变压暗）→ `.hero-glow`（胭脂径向光晕）→ `.hero-beam` / `.hero-sleeve` / `.hero-hairpin` / `.hero-petal` 装饰 → `.hero-frame` / `.hero-vertical` / `.hero-scroll` 结构层。
- `@nuxt/ui` v4 已接入，但 `nuxt.config.ts` 设 `ui.colorMode: false`，`app.config.ts` 的 `primary` 指向 `rouge`；`@nuxtjs/color-mode@4.0.1` 已作为 `@nuxt/ui` 传递依赖存在于 lockfile。
- 模板侧存在 35 处旧色阶 utility（main.css 29 处、`app.vue` 6 处），`skip-link` 与导航锚点均指向将被移除的区段。
- 静态托管约束见 `openspec/config.yaml`：GitHub Pages、`baseURL=/wyg/`、无服务端、纯静态产物。

## Goals / Non-Goals

**Goals:**

- 用 Tailwind v4 `@theme static` + `@nuxt/ui` primary 机制承载明/暗双模式令牌，把自定义 CSS 压到最低。
- 确定明亮 9 令牌 + 1 派生链接令牌、朱砂 11 阶色阶、暗色 9 令牌的具体值，并保证 AA 对比度。
- Hero 由照片栈改为纯文本 + 织纹 + 题签，保留 frame / vertical / scroll 三个结构层。
- 建立"令牌唯一真源"规则与旧类名映射表，消除硬编码。
- 补齐 `pnpm generate` 交付门槛。

**Non-Goals:**

- 不新建 `/fangxin`、`/xiangdi` 等路由，不实现关系层（投书/回信/题跋）。
- 不新增图片、字体或图标资源，不改 `@fontsource` 自托管方案。
- 不实现 `Person`/`Letter` 等真实数据模型，只定义占位形状。
- 不更换品牌图形（favicon、og 图）。

## Decisions

### D1 令牌分层与唯一真源

- `@theme static` 只声明**明亮**取值；暗色在 `html.dark` 下用同名变量覆盖，不引入 `--color-dark-*` 第二套命名。
- Tailwind v4 utility 编译为 `var(--color-*)`，`.dark` 选择器优先级高于 `:root`，覆盖即生效；实现后需在 DevTools 校验计算值，而非只看源码。
- **唯一真源规则**：模板与 CSS 只允许出现令牌名（`bg-paper`、`text-ink`、`border-ink/10`、`var(--color-zhu-600)`），禁止任意十六进制/rgb；渐变、阴影、`color-mix` 的颜色分量同样取令牌。
- 备选：明暗各写一套色阶名（`--color-dark-paper`）——已否决，会导致组件里出现模式判断分支，样式翻倍。

### D2 明亮模式令牌（对齐设计指南 §15.2）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--color-paper` | `#F7F3E9` | 页面底 |
| `--color-paper-deep` | `#EFE8D8` | 区块底、笺 |
| `--color-ink` | `#2A2622` | 正文（对比度 13.6:1） |
| `--color-ink-soft` | `#5C544A` | 次要文字（6.7:1） |
| `--color-dai` | `#3B4A54` | 标题、页脚（8.3:1） |
| `--color-tianqing` | `#7FA3A6` | 装饰性次级强调（**仅非文本**，文本对比度仅 2.46:1） |
| `--color-ouhe` | `#C9A7B6` | 标签、分隔（低饱和） |
| `--color-xiang` | `#E8D9A8` | 高亮底、印章衬底 |
| `--color-zhu` | `#B93B34` | 主强调、印章、CTA（5.1:1） |
| `--color-link` | `#4F7376` | **派生令牌**：链接与可点文本（4.7:1） |

设计指南只给了 9 色，但 §15.2 同时要求天青用于"链接"。`#7FA3A6` 在纸底上不满足 4.5:1，故派生 `--color-link`（同色相压暗），并在文档修订时补入 §15.2。

### D3 暗色模式令牌（重新设计）

基调定为「墨夜纸」：纸墨反转、保留暖调、不走旧胭脂夜宴路线。

| 令牌 | 值 | 说明 |
|------|-----|------|
| `--color-paper` | `#14120F` | 墨夜纸底 |
| `--color-paper-deep` | `#1D1A16` | 区块底、笺 |
| `--color-ink` | `#EDE4D6` | 正文（14.9:1） |
| `--color-ink-soft` | `#B6AA99` | 次要文字（8.2:1） |
| `--color-dai` | `#A9BCC4` | 标题、页脚（9.4:1） |
| `--color-tianqing` | `#93B8BB` | 装饰性次级强调 |
| `--color-ouhe` | `#D0B0BE` | 标签、分隔 |
| `--color-xiang` | `#D9C68F` | 高亮底、印章衬底 |
| `--color-zhu` | `#CE5B52` | 主强调（提亮后 4.7:1） |
| `--color-link` | `#93B8BB` | 链接（8.7:1） |

朱砂在暗底若沿用 `#B93B34` 仅约 3.2:1，故暗色提亮到 `#CE5B52`；仍只用于题名、印章、主按钮。

### D4 朱砂 11 阶色阶与 @nuxt/ui 接线

`@nuxt/ui` 的 `primary` 会生成 `bg-primary-500`、`text-primary-600`、`ring-primary-500` 等类，必须有完整色阶：

| 阶 | 值 | 阶 | 值 |
|----|-----|----|-----|
| 50 | `#FDF2F0` | 600 | `#B93B34`（基准） |
| 100 | `#FBE3DF` | 700 | `#9C2F29` |
| 200 | `#F6C6BF` | 800 | `#7E2621` |
| 300 | `#EFA39A` | 900 | `#631E1B` |
| 400 | `#E07A70` | 950 | `#3C100E` |
| 500 | `#CE5B52` |  |  |

- `app.config.ts`：`primary: 'zhu'`。
- 暗色下把 `--color-zhu-500/600/700` 覆盖为 `#E07A70 / #CE5B52 / #B93B34`，保证按钮与文字在墨底可用。
- `neutral` **保留 `stone`**：属暖灰，与纸绢不冲突；现有页面几乎不用 @nuxt/ui 组件，自定义 neutral 阶留到组件增多时再评估。

### D5 明暗切换实现

- `nuxt.config.ts`：`ui.colorMode: false` → `true`；根级追加 `colorMode: { preference: 'light', fallback: 'light' }`（`@nuxtjs/color-mode@4.0.1` 已在 lockfile）。
- 入口用 `@nuxt/ui` 的 `UColorModeButton`，置于 header 右侧，带 `aria-label`。
- 首屏防闪烁依赖模块注入的 head script；`generate` 后需在 `/wyg/` 路径下验证无闪白与 hydration 警告。
- 备选：手写 composable + 内联脚本。已否决——重复实现内建能力；若模块注册异常再降级到此方案。

### D6 Hero 织纹实现

- 删除照片栈：`.hero-media`、`.hero-veil`、`.hero-glow`、`.hero-beam`、`.hero-petal`、`.hero-hairpin` 及 `hero-drift` / `hero-beam` / `hero-hairpin-pulse` / `hero-petal-fall`。
- `.hero-sleeve` 保留曲线，去掉 `hero-sleeve-glow`，降为 `--color-xiang` 静态 1px 细线。
- 织纹用两条 `repeating-linear-gradient`（经线 90°、纬线 0°），间距 24px，颜色 `color-mix(in oklab, var(--color-ink) 7%, transparent)`，外包一层径向 `mask` 由中心向边缘淡出；随 `.dark` 自动换色。
- 结构层次：`.hero-frame` 四角框 → 题签（eyebrow）→ h1「众芳图」→ `.hero-vertical` slogan「不以无人而不芳」→ lede → CTA；`.hero-scroll` 卷容器保留，内部诗句原文不动，仅换令牌配色。
- 织纹纯 CSS，无图片请求；`prefers-reduced-motion` 下无动画（本就不含动画）。

### D7 纸绢颗粒层重标定

保留 `body::before` 的 SVG `feTurbulence` 噪声，按模式调参：

| 模式 | opacity | mix-blend-mode |
|------|---------|----------------|
| 明亮 | `0.035` | `multiply` |
| 暗色 | `0.05` | `soft-light` |

`pointer-events: none` 与 `position: fixed` 不变；`::selection` 与 `:focus-visible` 改用 `--color-zhu-700` / `--color-zhu-500`。

### D8 旧类名映射

| 旧类 | 新类 |
|------|------|
| `bg-ink-950` / `bg-ink-900` | `bg-paper` / `bg-paper-deep` |
| `text-ink-100` / `text-ink-50` | `text-ink` |
| `text-ink-300` / `text-ink-400` | `text-ink-soft` |
| `border-gold-400/15` | `border-ink/10` |
| `text-gold-300` / `text-gold-500` | `text-dai`（正文）或 `text-xiang`（纯装饰） |
| `bg-rouge-600` / `bg-rouge-700` | `bg-zhu`（或 `bg-primary`） |
| 硬编码 `#0A0608` | `var(--color-paper)` |

映射只做等价替换，不借机调整版式。替换后全局搜索 `ink-[0-9]|rouge-[0-9]|gold-[0-9]|#[0-9A-Fa-f]{3,6}` 应只剩令牌定义处。

### D9 首页结构、锚点与图片复用

- section id：`top`（卷首）、`huaxin`（花信）、`xiangdi` / `liji` / `jiejing` / `timing`（四入口卡片）、`zhou`（九州索引）、`join`（如何参与）、`rules`（编辑准则）。
- 导航：卷首 `#top`、花信 `#huaxin`、相地 `#xiangdi`、立基 `#liji`、借景 `#jiejing`、题名 `#timing`；skip-link → `#main`。
- 图片：`works[0]` 作花信主图，`works[1..4]` 作四张人物卷占位；生成 prompt 去除 `sultry / mysterious / half silhouette / candlelight / half of the face in shadow`，其余视觉描述保留。
- 占位数据结构：`{ id, name, region, selfTitle, image }`，仅用于渲染，不做持久化。
- 保留 `IntersectionObserver` 的 `data-reveal` / `.reveal` / `.is-visible` 逻辑与 `prefers-reduced-motion` 早退分支。

### D10 交付门槛

`ci.yml` 在 Typecheck 之后追加 `pnpm run generate`，与 deploy 流程保持同一条构建路径。

### D11 设计文档修订

- §15.2 改为明/暗双列表格，补 `--color-link` 与暗色取值。
- §15.6 反面清单补明亮模式禁用项：大面积高饱和色块、残留暗场图、暗色光晕。

## Risks / Trade-offs

- **@nuxt/ui 组件找不到 `zhu` 色阶** → 必须写满 50–950；实现后用 `validate` 前先本地起服务检查按钮/焦点环/下拉等组件着色。
- **`.dark` 覆盖不生效**（若某处 utility 内联了色值）→ DevTools 校验计算样式；必要时把暗色覆盖提到 `html.dark` 并提高选择器特异性。
- **SSR 首屏明暗闪烁** → `generate` 后在 `/wyg/` 实测；必要时设置 `preference: 'light'` 并在 head 内联脚本前置。
- **天青做文字不达标** → 已用 `--color-link` 兜底；禁止把 `text-tianqing` 用于正文或链接。
- **5 张暗调图片在暗色模式下糊底** → 图片容器加 `paper-deep` 底与 `1px` 描边，保留留白边界。
- **35 处旧类名漏改** → 以 D8 的全局搜索为验收命令，命中非令牌定义即视为未完成。
- **温庭筠艳诗与 §16.2 语义红线冲突** → 变更内显式列为已知例外，仅调样式；内容阶段再处理，避免验收时反复。
- **删除 29 个色阶变量影响未知用处** → 已确认引用仅 main.css 与 app.vue 共 35 处；生成后仍需全站回归。

## Migration Plan

1. 重写 `@theme static`（明/暗令牌 + 朱砂色阶），加 `.dark` 覆盖与 `--color-link`。
2. 重标颗粒层、`::selection`、`:focus-visible`。
3. 按 D8 替换模板与组件中的旧类名，跑一次全局搜索验收。
4. 重构 Hero：删照片栈与禁用装饰，加水袖静态线、织纹、题签。
5. 改写品牌、SEO、导航、skip-link、footer。
6. 按 §13.3 重排首页六段，迁移 5 张图片为花信主图与占位卷。
7. 修订设计指南 §15.2 / §15.6。
8. CI 补 `pnpm generate`，本地跑 lint / typecheck / generate 三件套。

回滚：整变更位于单个 PR，静态站点无数据迁移，直接 revert 即可恢复旧版。

## Open Questions

- 页脚邮箱仍为 `studio@jiangxue.art`（旧域名）：本变更默认保留地址、仅去除旧品牌字样，待提供新邮箱再替换。
- favicon 与 og 分享图是否随品牌更换：默认本变更不动图形资源。
- header 英文副名拼写：默认 `ZHONGFANGTU`，如需 `ZHONGFANG TU ZHI` 再调。
