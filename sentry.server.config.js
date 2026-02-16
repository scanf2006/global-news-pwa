import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // 环境
    environment: process.env.NODE_ENV,

    // 性能监控采样率
    tracesSampleRate: 0.1,

    // 版本信息
    release: '0.9.0',

    // 过滤敏感信息
    beforeSend(event) {
        // 移除敏感数据
        if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
        }

        return event;
    },
});
