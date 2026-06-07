import * as Sentry from '@sentry/nextjs';

const release = process.env.NEXT_PUBLIC_APP_VERSION || '0.9.21';

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Network request failed',
        'Failed to fetch',
        'Load failed',
        'NetworkError',
    ],
    release,
    beforeSend(event) {
        if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
        }

        event.tags = {
            ...event.tags,
            version: release,
            platform: 'web',
        };

        return event;
    },
    integrations: [
        Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
        }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
});
