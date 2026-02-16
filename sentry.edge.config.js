import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // 环境
    environment: process.env.NODE_ENV,

    // 性能监控采样率
    tracesSampleRate: 0.1,

    // 版本信息
    release: '0.9.0',
});
