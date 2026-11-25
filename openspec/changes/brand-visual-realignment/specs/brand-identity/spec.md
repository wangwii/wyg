# Spec Delta

## Purpose

定义「众芳图」的品牌身份契约：品牌名与命名体系、印章、SEO 元信息、导航与首页信息架构、文案写作与禁用词规范，确保对外触点始终保持「主语在她」的统一表达。

## ADDED Requirements

### Requirement: 品牌名与命名体系

站点 MUST 以「众芳图」为唯一品牌名，副名「众芳图志」，slogan「不以无人而不芳」；MUST NOT 出现旧品牌「未央」「WEIYANG」或其衍生文案。

#### Scenario: 品牌名全站一致
- **WHEN** 查看 header、页脚与浏览器标题（1440px 与 390px）
- **THEN** 均显示「众芳图」，不出现「未央」或「WEIYANG」

#### Scenario: 副名与 slogan 呈现
- **WHEN** 查看品牌呈现位置
- **THEN** 副名「众芳图志」与 slogan「不以无人而不芳」与定案一致

### Requirement: 品牌印章

品牌印章 MUST 以朱砂方印形式呈现印文「众芳图」，并作为纯装饰元素，MUST NOT 进入无障碍朗读内容。

#### Scenario: 印文正确
- **WHEN** 查看 header 与页脚印章（1440px 与 390px）
- **THEN** 印文为「众芳图」

#### Scenario: 印章不干扰读屏
- **WHEN** 使用屏幕阅读器阅读页面
- **THEN** 印章不被朗读为正文内容

### Requirement: 站点标题与 SEO 元信息

首页 MUST 提供与品牌一致的 title、description、ogTitle、ogDescription，且 MUST NOT 含禁用词语气。

#### Scenario: 页面元信息
- **WHEN** 查看页面 head（1440px 与 390px 为同一文档）
- **THEN** title 为「众芳图 · 不以无人而不芳」，description 为众芳图语义且不含禁用词

#### Scenario: 社交分享信息
- **WHEN** 抓取 ogTitle 与 ogDescription
- **THEN** 内容与品牌定位一致，指向站点根路径 /wyg/

### Requirement: 导航与锚点结构

主导航 MUST 为「卷首 / 花信 / 相地 / 立基 / 借景 / 题名」，全部指向首页对应锚点；skip-link MUST 指向 #main；MUST NOT 存在指向已移除区段的链接。

#### Scenario: 桌面导航
- **WHEN** 1440px 查看导航
- **THEN** 六项标签正确，点击后跳转到首页对应区段

#### Scenario: 移动导航
- **WHEN** 390px 打开移动菜单并点击某一项
- **THEN** 跳转到对应区段且菜单自动关闭

#### Scenario: skip-link 可用
- **WHEN** 使用键盘首次 Tab 触发 skip-link
- **THEN** 焦点落到 #main，页面无失效锚点

### Requirement: 首页信息架构

首页 MUST 自上而下包含六段：卷首、本期花信、四个入口（相地 / 立基 / 借景 / 题名）、九州索引、如何参与、编辑准则。

#### Scenario: 六段按序呈现
- **WHEN** 在 1440px 与 390px 下滚动首页
- **THEN** 六段按序出现且每段有可识别标题

#### Scenario: 四入口含解释
- **WHEN** 查看四个入口段
- **THEN** 相地、立基、借景、题名各配一句解释

#### Scenario: 九州索引含空缺标注
- **WHEN** 查看九州索引
- **THEN** 展示 8–12 个文化地理大区，未开放的区显式标注「待续」类文案

#### Scenario: 编辑准则公开边界
- **WHEN** 查看首页末段
- **THEN** 公开「我们不做什么」的编辑准则，可被访客读到

### Requirement: 文案写作原则与禁用词

界面文案 MUST 使用第一人称、现在时、主动语态，主语在她；MUST NOT 出现「失 / 怨 / 恨 / 闺 / 媚 / 残 / 瘦」字根，以及「妖冶」「sultry」「纯欲」类语感与旧文案「不肯醒来的夜」「旧梦」「残照」「夜宴」「丝弦未歇」。

#### Scenario: 界面无禁用词
- **WHEN** 检索 1440px 与 390px 渲染出的全部界面文案
- **THEN** 无上述禁用字根、语感与旧文案残留

#### Scenario: 文案语态正确
- **WHEN** 阅读人物与栏目文案
- **THEN** 为第一人称主动语态，无被凝视、被代言或被动等待的表达

### Requirement: 图片资产复用与占位卷

本变更 MUST 复用现有 5 张图片资产（1 张花信主图 + 4 张人物卷占位），MUST NOT 新增图片资源；人物卷占位 MUST 为单张主图加题名与来处信息。

#### Scenario: 不新增图片资源
- **WHEN** 检查页面图片请求（1440px 与 390px）
- **THEN** 图片均来自既有资产，无新增外部图片

#### Scenario: 占位卷非图集
- **WHEN** 查看人物卷占位
- **THEN** 呈现单张主图与题名、来处，不是九宫格或照片墙

### Requirement: 卷首诗文的例外保留

首页卷首卷轴内的既有诗句文本在本变更中 MUST 保持原文不变，仅允许调整色彩与版式；该例外 MUST NOT 扩展到其他文案。

#### Scenario: 诗句文本不变
- **WHEN** 查看卷首卷轴（1440px 与 390px）
- **THEN** 诗句文本与变更前逐字一致

#### Scenario: 例外不扩散
- **WHEN** 审查卷轴以外的全部文案
- **THEN** 仍严格遵循禁用词与语态规范
