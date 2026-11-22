const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.sentry.io",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
    compress: true,
    images: {
        formats: ['image/webp', 'image/avif'],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920],
        imageSizes: [16, 32, 48, 64, 96, 128, 256],
        minimumCacheTTL: 60,
    },
    productionBrowserSourceMaps: false,
    experimental: {
        optimizeCss: true,
        optimizePackageImports: ['@/components', '@/lib', '@/services'],
    },
    poweredByHeader: false,
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'SAMEORIGIN',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: contentSecurityPolicy,
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()',
                    },
                ],
            },
        ];
    },
    reactStrictMode: true,
};

const nextPwa = require('@ducanh2912/next-pwa');

const withPWA = nextPwa.default({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
    workboxOptions: {
        runtimeCaching: [
            // 新闻接口由服务端和 localStorage 管理缓存，避免 SW 超时后返回旧数据
            {
                urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname === '/api/news',
                handler: 'NetworkOnly',
                method: 'GET',
            },
            ...nextPwa.runtimeCaching,
        ],
    },
});

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
    withPWA(nextConfig),
    {
        silent: true,
        org: 'scanf2006',
        project: 'global-news-pwa',
    }
);
