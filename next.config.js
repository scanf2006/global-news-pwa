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
    // 该包经 webpack 打包后无法运行，需保持为服务端外部依赖
    serverExternalPackages: ['google-translate-api-x'],
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

const { version } = require('./package.json');

const withSerwist = require('@serwist/next').default({
    swSrc: 'src/app/sw.js',
    swDest: 'public/sw.js',
    disable: process.env.NODE_ENV === 'development',
    reloadOnOnline: false, // 网络恢复时由页面局部刷新，避免丢失阅读位置
    additionalPrecacheEntries: [{ url: '/', revision: version }],
});

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
    withSerwist(nextConfig),
    {
        silent: true,
        org: 'scanf2006',
        project: 'global-news-pwa',
    }
);
