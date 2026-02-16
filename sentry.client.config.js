import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // 环境
    environment: process.env.NODE_ENV,

    // 性能监控采样率(10% - 节省配额)
    tracesSampleRate: 0.1,

    // 忽略常见的无害错误
    ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Network request failed',
        'Failed to fetch',
        'Load failed',
        'NetworkError'
    ],

    // 版本信息
    release: '0.9.0',

    // 过滤敏感信息
    beforeSend(event, hint) {
        // 移除敏感数据
        if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
        }

        // 添加自定义标签
        event.tags = {
            ...event.tags,
            version: '0.9.0',
            platform: 'web'
        };

        return event;
    },

    // 集成配置
    integrations: [
        Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],

    // Session Replay采样率
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
});
