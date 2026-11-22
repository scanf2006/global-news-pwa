import { defaultCache } from '@serwist/next/worker';
import { NetworkOnly, Serwist } from 'serwist';

const LEGACY_CACHES = ['apis', 'start-url'];

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    precacheOptions: { cleanupOutdatedCaches: true },
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        // 新闻接口由服务端和 localStorage 管理缓存，避免返回过期数据
        {
            matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: new NetworkOnly(),
        },
        ...defaultCache,
    ],
    // 断网打开任意页面时回退到已预缓存的应用外壳
    fallbacks: {
        entries: [{ url: '/', matcher: ({ request }) => request.destination === 'document' }],
    },
});

// 清理旧版 PWA 插件留下的运行时缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all(LEGACY_CACHES.map((name) => caches.delete(name))));
});

serwist.addEventListeners();
