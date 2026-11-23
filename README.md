# Global News PWA

一个自用的全球热点聚合 PWA，基于 `Next.js 16` 和 `App Router`。

## 功能

- 聚合 RSS、YouTube 新闻频道、Hacker News、X、微博等来源的热点内容
- 自动将非中文标题翻译为中文
- 支持基于本地聚合结果生成热点概览
- 支持本地缓存、下拉刷新、左滑删除卡片
- 支持安装为 PWA

## 本地运行

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 常用命令

```bash
npm run dev
npm run lint
npm test
npm run build
npm run start
```

## 环境变量

- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_APP_VERSION`
- `CRON_SECRET`: 保护缓存预热和生产环境来源诊断接口
- `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`: 可选，启用跨实例共享缓存（也兼容 `KV_REST_API_URL`、`KV_REST_API_TOKEN`）
- `GOOGLE_TRANSLATE_API_KEY`: 可选，启用 Google Cloud Translation 官方接口
- `REDDIT_CLIENT_ID`、`REDDIT_CLIENT_SECRET`: 可选，配置后才启用 Reddit 来源（新应用需通过 Reddit 审批）

## 结构说明

- `src/app/api/news/route.js`: 聚合新闻 API
- `src/app/api/digest/route.js`: 已停用的旧 AI 摘要接口，占位返回 410
- `src/app/api/diagnostics/route.js`: 开发环境 YouTube 频道 RSS 健康检查
- `src/app/api/diagnostics/weibo/route.js`: 开发环境微博备用源检查
- `src/services/*`: 各平台抓取与聚合逻辑
- `src/services/newsNormalizer.js`: 链接、时间规范化与多源合并
- `src/components/*`: 页面组件
- `tests/*`: Node 内置测试
- `public/manifest.json`: PWA 清单

## 健康检查

- 开发环境可访问 `/api/diagnostics`
- 开发环境可访问 `/api/diagnostics/weibo`
- `/api/diagnostics/sources` 查看各来源成功率和耗时，生产环境需携带 `Authorization: Bearer <CRON_SECRET>`
- `/api/cron/refresh` 用于定时预热缓存，配置仓库变量 `NEWS_REFRESH_URL` 和密钥 `CRON_SECRET` 后由 GitHub Actions 每 15 分钟调用
- 发布前至少执行一次 `npm run lint`、`npm test` 和 `npm run build`

## 依赖与安全说明

- 已升级 `next` 和 `@sentry/nextjs` 到当前可直接修复的安全版本
- 剩余 `npm audit` 结果主要集中在 PWA / bundler 生态的传递依赖，处理时优先验证 `npm run build`
- 不建议为了清空审计结果而盲目强行升级所有传递依赖，先看是否真的影响本地运行和打包

## 当前约束

- 首页概览卡完全基于本地聚合结果生成，不依赖外部模型
