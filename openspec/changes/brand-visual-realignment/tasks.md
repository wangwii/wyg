# Tasks

## 1. 色彩令牌体系（app/assets/css/main.css）

- [ ] 1.1 重写 `@theme static`：写入明亮 10 个令牌（paper / paper-deep / ink / ink-soft / dai / tianqing / ouhe / xiang / zhu / link）与朱砂 50–950 十一阶色阶；验证：浏览器 DevTools 中 `getComputedStyle(document.documentElement)` 能取到全部 `--color-*` 变量且值符合 design.md D2/D4
- [ ] 1.2 在 `html.dark` 下同名覆盖暗色 10 个令牌，并将 `--color-zhu-500/600/700` 覆盖为 `#E07A70 / #CE5B52 / #B93B34`；验证：给 `<html>` 加 `dark` 类后，计算样式切换为 design.md D3 的取值，且不出现第二种变量命名
- [ ] 1.3 重标 `body::before` 颗粒层（明亮 `opacity .035 + multiply`、暗色 `.05 + soft-light`），把 `::selection` 改为 `--color-zhu-700`、`:focus-visible` 改为 `--color-zhu-500`；验证：明亮模式大面积留白无灰蒙，暗色无噪点堆积，Tab 聚焦环可见
- [ ] 1.4 修改 `app/app.config.ts`：`ui.colors.primary` 由 `rouge` 改为 `zhu`，`neutral` 保持 `stone`；验证：`pnpm dev` 下任意 @nuxt/ui 按钮/焦点环呈现朱砂色，控制台无缺色阶警告

## 2. 旧色阶清除与模板映射

- [ ] 2.1 按 design.md D8 映射表替换 `app/assets/css/main.css` 中 29 处旧色阶与硬编码色值；验证：`Select-String -Path app/assets/css/main.css -Pattern 'ink-\d|rouge-\d|gold-\d|#[0-9A-Fa-f]{3,6}'` 只剩令牌定义行
- [ ] 2.2 替换 `app/app.vue` 中 6 处旧色阶 utility（`bg-ink-950/95`、`border-gold-400/15`、`text-ink-100`、`hover:text-gold-300` 等）；验证：对 `app/` 全目录执行 `Select-String -Pattern 'ink-\d|rouge-\d|gold-\d'` 无命中

## 3. Hero 区重构

- [ ] 3.1 在 `app/assets/css/main.css` 删除 `.hero-media`、`.hero-veil`、`.hero-glow`、`.hero-beam`、`.hero-petal`、`.hero-hairpin`（含 shaft/head/drop）样式与 `hero-drift`、`hero-beam`、`hero-hairpin-pulse`、`hero-petal-fall` 四组 keyframes；验证：上述选择器与 keyframes 在文件中检索为空
- [ ] 3.2 保留 `.hero-sleeve` 曲线，删除 `hero-sleeve-glow`，改为 `--color-xiang` 静态 1px 细线；验证：水袖无发光动画，`prefers-reduced-motion` 外观感一致
- [ ] 3.3 在 `app/pages/index.vue` 移除 `heroImage` 定义与 `<img>` 引用，新增经纬织纹层（两条 `repeating-linear-gradient` + 径向 mask，颜色取 `--color-ink`）；验证：Hero 区域网络面板无图片请求，明暗两模式织纹可见且不压字
- [ ] 3.4 重组卷首内容：`.hero-frame` → 题签 → h1「众芳图」→ `.hero-vertical` slogan「不以无人而不芳」→ lede → CTA，保留 `.hero-scroll` 容器与其中诗句原文；验证：诗句与变更前逐字一致，390px 下装饰层按规则隐藏

## 4. 明暗模式切换

- [ ] 4.1 修改 `nuxt.config.ts`：`ui.colorMode` 由 `false` 改为 `true`，并追加 `colorMode: { preference: 'light', fallback: 'light' }`；验证：`pnpm dev` 首屏为明亮模式，`useColorMode()` 可读写
- [ ] 4.2 在 `app/app.vue` header 右侧加入 `UColorModeButton` 并补 `aria-label`；验证：1440px 与 390px 下均可切换，切换后无布局跳动
- [ ] 4.3 验证静态产物无闪烁：执行 `pnpm generate` 后用 `pnpm preview` 在 `/wyg/` 路径检查首屏 class 与 hydrate；验证：无闪白、无 hydration mismatch 警告

## 5. 品牌与 SEO

- [ ] 5.1 修改 `app/components/BrandSeal.vue` 印文为「众芳图」，保持 `aria-hidden` 装饰属性；验证：header 与页脚印章文字正确，读屏不朗读
- [ ] 5.2 修改 `app/app.vue`：header 品牌「众芳图 / ZHONGFANGTU」、`useHead` 的 `htmlAttrs.class` 交由 colorMode 接管、`title` 改为「众芳图 · 不以无人而不芳」、`description` 改为「众芳图，一部由她们自己落笔的长卷。」、footer 品牌与版权文案改写；验证：页面 title 与页脚无「未央 / WEIYANG」
- [ ] 5.3 修改 `app/app.vue` 的 `navItems` 为卷首 `#top`、花信 `#huaxin`、相地 `#xiangdi`、立基 `#liji`、借景 `#jiejing`、题名 `#timing`，`skip-link` 指向 `#main`；验证：六项点击均落到首页对应区段，键盘 Tab 首个焦点进入 `#main`
- [ ] 5.4 修改 `app/pages/index.vue` 的 Hero 与 SEO 相关文案，移除 `sultry / mysterious / half silhouette / candlelight` 等 prompt 表述；验证：文件内检索上述英文词为空

## 6. 首页信息架构与图片复用

- [ ] 6.1 在 `app/pages/index.vue` 按 §13.3 建立六段与锚点：卷首 `#top`、本期花信 `#huaxin`、四入口 `#xiangdi/#liji/#jiejing/#timing`、九州索引 `#zhou`、如何参与 `#join`、编辑准则 `#rules`，保留 `data-reveal` 与 IntersectionObserver 逻辑；验证：六段按序渲染，滚动显现正常，`prefers-reduced-motion` 下内容直接可见
- [ ] 6.2 将现有 5 张图片迁移为 1 张花信主图 + 4 张人物卷占位，占位数据结构为 `{ id, name, region, selfTitle, image }`，每卷单张主图；验证：图片请求仍为既有 5 张资产，无九宫格或照片墙
- [ ] 6.3 实现九州索引 8–12 个文化地理大区并显式标注空缺；验证：390px 单列可读，未开放区显示「待续」类文案，无座次或排序暗示
- [ ] 6.4 实现「如何参与」四条路径与「编辑准则」公开边界；验证：两段内容可读，准则文案明确写出「我们不做什么」

## 7. 文案语义清洗

- [ ] 7.1 改写 `app/pages/index.vue` 中所有区块文案为第一人称、现在时、主动语态；验证：检索「不肯醒来的夜 / 旧梦 / 残照 / 夜宴 / 丝弦未歇」无命中
- [ ] 7.2 改写 `app/app.vue` 品牌与页脚文案，去除「妖冶」「古典舞者 · 影像创作者」等旧定位表述；验证：全站渲染文案无「未央 / WEIYANG / 妖冶」
- [ ] 7.3 全局校验禁用字根：对 `app/` 执行 `Select-String -Pattern '失|怨|恨|闺|媚|残|瘦'` 并逐条判定；验证：除卷首诗文的已知例外外无残留，例外项在代码注释中标注

## 8. 设计文档与 CI

- [ ] 8.1 修订 `docs/00-众芳图设计指南.md` §15.2：把「v2 建议值（替换现有暗色体系）」改为明/暗双列表格，补入 `--color-link` 与暗色取值；验证：表格含两套取值且与 design.md D2/D3 一致
- [ ] 8.2 复核并补充 `docs/00-众芳图设计指南.md` §15.6 反面清单的明亮模式禁用项（大面积高饱和色块、残留暗场图、暗色光晕）；验证：清单明确区分明/暗两种模式
- [ ] 8.3 在 `.github/workflows/ci.yml` 的 Typecheck 之后追加 `pnpm run generate` 步骤；验证：本地执行 `pnpm generate` 成功，工作流 YAML 语法正确

## 9. 集成验证

- [ ] 9.1 在 1440px 与 390px、明亮与暗色四种组合下逐段核对首页，确认无横向溢出、无元素重叠、Hero 无禁用元素、朱砂仅出现在题名/印章/主按钮；验证：四种组合截图比对均通过
- [ ] 9.2 执行 `pnpm lint`、`pnpm typecheck`、`pnpm generate` 三步并记录结果；验证：三步全部退出码为 0，产物生成于 `.output/public` 且可在 `/wyg/` 路径预览

## Workflow follow-up

- 按项目评审要求完成后，归档该变更。
- 归档后核对生成的 main specs 是否包含 visual-system 与 brand-identity 的 Purpose 与全部需求。
