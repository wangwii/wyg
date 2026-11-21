# Nuxt 项目改造为纯静态站点并部署到 GitHub Pages

## Context（背景）

当前 `d:\Workspace\Codes\wyg` 是一个干净的 Nuxt 4 Starter Template，仅含一个 `index.vue` 页面 + `TemplateMenu.vue` 组件，没有服务端接口、没有运行时数据获取。用户希望把它转成"纯前端项目"——`build` 产物是纯静态 HTML/CSS/JS，能直接托管到 GitHub Pages。

经与用户确认：
- **技术路线**：保留 Nuxt，开启 SSG 静态导出（不切换到 Vite）
- **部署路径**：`https://<OWNER>.github.io/wyg/`，所以 `app.baseURL = '/wyg/'`
- **部署方式**：push 到 `main` 时通过 GitHub Actions 自动发布

最终产物特性：
- 运行时**完全不需要 Node 服务**，只是静态文件
- 首屏 HTML 已包含页面内容（SEO 友好，禁用 JS 也能看到内容）
- 客户端 hydration 后变为 SPA，路由跳转无刷新

## 关键设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| `ssr` 配置 | `ssr: true` + `nuxi generate` | 构建时执行 SSR 把内容写进 HTML；部署后只是静态文件 |
| Nitro 预设 | `nitro.preset: 'github_pages'` | 自动开 crawlLinks、生成 `404.html`、生成 `.nojekyll` |
| 资源目录 | 保持默认 `_nuxt/` | `.nojekyll` 已让 GitHub Pages 跳过 Jekyll，无需改名 |
| 发布载体 | GitHub Pages artifact（官方 Actions） | 不维护 `gh-pages` 分支，权限最小，有原生部署记录 |
| SPA fallback | 不做 hack | 所有真实页面都预渲染，`404.html` 只处理未知路径 |
| 包管理器 | pnpm@12.15.0 + Node 24 | 与现有 `ci.yml` 保持一致 |

## 改动清单

### 1. `nuxt.config.ts` — 核心配置

新增/修改以下字段：
- `ssr: true`（显式声明，虽然 Nuxt 4 默认就是 true）
- `nitro: { preset: 'github_pages' }`
- `app: { baseURL: '/wyg/' }`
- `icon: { clientBundle: { scan: true } }` — 把 `.vue` 文件中字面量使用的 iconify 图标打包进客户端 bundle，避免运行时回退到 iconify 公网 API
- 保留现有 `routeRules: { '/': { prerender: true } }`（虽然冗余但无副作用）
- 保留现有 `devtools`、`eslint`、`css`、`compatibilityDate` 不动

不需要设置：`app.buildAssetsDir`、`experimental.payloadExtraction`、`app.head` 中的 `<base>`。

### 2. `app/app.vue` — 修正 favicon 子路径

当前 `useHead` 中 `link: [{ rel: 'icon', href: '/favicon.ico' }]` 在子路径部署下会请求 `https://<OWNER>.github.io/favicon.ico`（404）。

改为 `/wyg/favicon.ico`。

`og:image` 是完整外部 URL（`https://ui.nuxt.com/...`），保持不变。

### 3. `package.json` — 新增 generate script

在 `scripts` 中添加：
- `"generate": "nuxi generate"`

现有 `dev/build/preview/lint/typecheck/postinstall` 全部保留。

### 4. `.github/workflows/deploy.yml` — 新增部署 workflow

- `name: deploy`
- 触发：`push` 到 `main` + `workflow_dispatch`
- 顶层权限：`contents: read`
- `concurrency`: group=`pages`，`cancel-in-progress: false`

**build job**（`ubuntu-latest`）：
1. `actions/checkout@v7`
2. `pnpm/action-setup@v6`（`run_install: false`，版本由 `packageManager` 字段决定）
3. `actions/setup-node@v7`，`node-version: 24`，`cache: pnpm`
4. `pnpm install --frozen-lockfile`
5. `pnpm generate`
6. `actions/upload-pages-artifact@v3`，`path: .output/public`

**deploy job**：
- `needs: build`
- 权限：`pages: write`、`id-token: write`
- `environment`: name=`github-pages`，url 取 `steps.deployment.outputs.page_url`
- 步骤：`actions/deploy-pages@v4`，`id: deployment`

现有 `ci.yml` 保留，继续负责 lint + typecheck。

## 不需要做的事

- 不需要 `public/.nojekyll`（预设自动生成）
- 不需要 `public/404.html`（`nuxi generate` 自动生成）
- 不需要 SPA redirect hack、`spa-github-pages`、`_redirects`
- 不需要 `peaceiris/actions-gh-pages`、`actions/configure-pages`
- 不需要 `NITRO_PRESET` 环境变量（预设已写进 config）
- 不需要 `preview:static` script（直接 serve `.output/public` 无法真实模拟子路径，容易误导）

## 用户需要在 GitHub 网页上操作的事

代码推送后：
1. 确认仓库名是 `wyg`，最终地址 `https://<OWNER>.github.io/wyg/`
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**（不要选 "Deploy from a branch"）
3. push 到 `main` 或在 Actions 页手动触发 `deploy` workflow

## 验证清单

### 本地

依次执行：
- `pnpm lint`
- `pnpm typecheck`
- `pnpm generate`

检查 `.output/public/`：
- 存在 `index.html`、`404.html`、`.nojekyll`、`favicon.ico`、`_nuxt/`
- `index.html` 中 JS/CSS 引用为 `/wyg/_nuxt/...`（不是 `/_nuxt/...`）
- favicon 引用为 `/wyg/favicon.ico`
- 页面正文已渲染进 HTML（不是空的 `#__nuxt` 容器）

子路径真实预览（Windows PowerShell）：
1. 在临时目录建预览根，例如 `$env:TEMP\wyg-preview`
2. 在其中创建符号链接 `wyg` 指向 `d:\Workspace\Codes\wyg\.output\public`
3. 对预览根运行 `npx serve`
4. 访问 `http://localhost:3000/wyg/`，浏览器 Network 中所有 `_nuxt` 请求都带 `/wyg/` 前缀且返回 200

### 线上

- GitHub Actions 中 `deploy` workflow 的 build、deploy 两个 job 全绿
- `https://<OWNER>.github.io/wyg/` 可正常访问
- 所有 `/wyg/_nuxt/...` 请求 200
- 刷新页面正常
- 部署记录显示在 `github-pages` environment 下

## 风险与注意事项

- **图标离线可用**：`icon.clientBundle.scan: true` 只扫描 `.vue` 文件中字面量图标名；未来若动态拼接图标名（如 `:icon="\`i-lucide-${name}\`"`），需额外加到 `clientBundle.icons` 白名单
- **动态路由**：未来加 `/blog/[slug]` 这类动态页时，必须把具体路径加到顶层 `prerender.routes`，crawler 不会自动推导出实例
- **构建时数据固定**：未来若用 `useFetch/useAsyncData` 参与预渲染，数据会固定在构建时，更新需要重新部署
- **仓库改名**：从 `wyg` 改名后必须同步改 `app.baseURL` 和 `app.vue` 的 favicon 路径
- **不要写死内部链接**：内部跳转继续用 `<NuxtLink to="/about">`，Nuxt 会自动加 `/wyg/` 前缀；不要手写 `/wyg/about`

## 涉及文件汇总

修改：
- `nuxt.config.ts`
- `app/app.vue`
- `package.json`

新增：
- `.github/workflows/deploy.yml`

不改：
- `.github/workflows/ci.yml`
- `app/pages/index.vue`
- `app/components/TemplateMenu.vue`
- `tsconfig.json`
- `public/favicon.ico`
