# Spec Delta

## Purpose

定义「众芳图」站点的视觉表达契约：明/暗双模式色彩令牌、朱砂强调色比例、纸绢质感、Hero 禁用元素与动效无障碍降级，确保所有页面在统一令牌体系下呈现纸绢温润的古典气质。

## ADDED Requirements

### Requirement: 明暗双模式色彩令牌

站点 MUST 提供明亮与暗色两种配色模式，二者共享同一组语义令牌（纸、深纸、墨、淡墨、黛、天青、藕荷、缃、朱砂），首次访问 MUST 默认呈现明亮模式。两种模式下正文与背景的对比度 MUST 达到 WCAG AA（≥ 4.5:1），并提供可见的模式切换入口。

#### Scenario: 首次访问为明亮模式
- **WHEN** 用户首次访问任意页面（1440px 与 390px 两种宽度）
- **THEN** 页面以纸绢明亮基调呈现（纸 #F7F3E9 底、墨 #2A2622 正文），无需手动切换

#### Scenario: 切换到暗色模式
- **WHEN** 用户在 1440px 或 390px 下触发模式切换入口
- **THEN** 文字、背景、边框、强调色同步切换为暗色令牌值，无残留亮色区块，且无布局位移

#### Scenario: 双模式文字对比度
- **WHEN** 在任一模式下测量正文、次要文字、链接文字与背景的对比度
- **THEN** 均不低于 4.5:1

### Requirement: 朱砂强调色用色比例

朱砂 MUST 是页面唯一的高饱和强调色，仅用于题名、印章、主按钮三处，视觉面积 MUST NOT 超过整页约 2%；其余位置 MUST NOT 出现高饱和色块。

#### Scenario: 高饱和色仅限三处
- **WHEN** 审阅任一页面（1440px 与 390px）
- **THEN** 高饱和色只出现在题名、印章、主按钮

#### Scenario: 朱砂面积受控
- **WHEN** 统计整页朱砂色像素占比
- **THEN** 不超过约 2%，且无第二处高饱和色系

### Requirement: 颜色必须来自令牌集合

界面所有颜色 MUST 取自明/暗令牌集合，包括渐变、阴影、描边与滤镜中的颜色；MUST NOT 出现旧色阶类名（ink-* / rouge-* / gold-*）或令牌集合之外的硬编码色值。

#### Scenario: 无令牌外颜色
- **WHEN** 审查 1440px 与 390px 页面的样式与模板
- **THEN** 不存在 ink-/rouge-/gold- 类名，也不存在令牌集合之外的十六进制或 rgb 色值

#### Scenario: 模式切换时颜色一致迁移
- **WHEN** 切换明暗模式
- **THEN** 所有颜色均由令牌驱动同步变化，无局部停留旧值

### Requirement: Hero 区禁用元素

Hero 区 MUST NOT 出现暗场烛光、光束、飘落花瓣、凤钗饰品、半剪影人物或「回眸」凝视镜头；MUST NOT 使用照片作为 Hero 背景。

#### Scenario: 禁用元素全部缺席
- **WHEN** 查看 Hero（1440px 与 390px）
- **THEN** 无烛光与光束、无花瓣飘落、无凤钗、无半剪影照片背景

#### Scenario: 减少动效偏好下无循环动画
- **WHEN** 系统偏好 prefers-reduced-motion: reduce 时查看 Hero
- **THEN** 不播放任何循环或位移动画，布局与内容不变

### Requirement: Hero 纯文本织纹基底

Hero MUST 由纯文本、经纬织纹底、卷首题签与 slogan 构成，MUST NOT 发起图片请求；织纹 MUST 在明暗两种模式下清晰可辨且不降低文字可读性。

#### Scenario: Hero 不加载图片
- **WHEN** 加载首页 Hero（1440px 与 390px）
- **THEN** 呈现题签、slogan 与织纹底，网络面板无 Hero 相关图片请求

#### Scenario: 双模式下文字可读
- **WHEN** 在明亮与暗色模式下阅读 Hero 文字
- **THEN** 文字与织纹底对比清晰，不出现纹理压字

#### Scenario: 减少动效偏好下织纹静态
- **WHEN** prefers-reduced-motion: reduce
- **THEN** 织纹保持静态，无漂移或脉冲动画

### Requirement: 纸绢颗粒质感

全站纸绢颗粒覆盖层 MUST 在明亮模式下呈现细腻纸质、在暗色模式下不形成噪点或色斑；覆盖层 MUST NOT 拦截指针与键盘交互。

#### Scenario: 明亮模式颗粒细腻
- **WHEN** 在明亮模式查看大面积留白（1440px 与 390px）
- **THEN** 颗粒均匀细腻，无灰蒙脏污感

#### Scenario: 暗色模式颗粒干净
- **WHEN** 切换暗色模式查看同一区域
- **THEN** 颗粒不形成明显噪点或色斑

#### Scenario: 覆盖层不拦截交互
- **WHEN** 用户点击按钮或滚动页面
- **THEN** 颗粒层与装饰层不接收指针事件

### Requirement: 动效与减少动效偏好

所有装饰性动效 MUST 在 prefers-reduced-motion: reduce 时停止；滚动显现内容 MUST 直接可见，不得依赖动画完成才可读。

#### Scenario: 减少动效偏好下内容立即可见
- **WHEN** 系统偏好 reduce 时浏览首页（1440px 与 390px）
- **THEN** 所有装饰动画静止，滚动显现内容立即可见

#### Scenario: 默认偏好下动效正常
- **WHEN** 系统无减少动效偏好
- **THEN** 滚动显现按预期播放，且不引起布局偏移

### Requirement: 响应式断点

页面 MUST 在 1440px 桌面与 390px 移动宽度下均无横向溢出与元素重叠；移动端断点 MUST 为 639px / 640px。

#### Scenario: 桌面版式
- **WHEN** 以 1440px 宽度查看
- **THEN** 栅格与留白符合纸绢版式，无横向滚动条

#### Scenario: 移动版式
- **WHEN** 以 390px 宽度查看
- **THEN** 呈单列布局，导航可用，装饰层按既定规则隐藏，无横向滚动条
