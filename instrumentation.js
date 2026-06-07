import * as Sentry from '@sentry/nextjs';

const release = process.env.NEXT_PUBLIC_APP_VERSION || '0.9.21';

export const onRequestError = Sentry.captureRequestError;

export async function register() {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        release,
        beforeSend(event) {
            if (event.request) {
                delete event.request.cookies;
                delete event.request.headers;
            }

            return event;
        },
    });
}
