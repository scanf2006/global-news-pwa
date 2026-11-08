const cacheStore = new Map();
const MAX_SERVER_CACHE_ENTRIES = 200;

/**
 * 服务端内存缓存工具类（带过期时间与最大容量限制）
 */
export class ServerCache {
    static get(key) {
        const cached = cacheStore.get(key);

        if (!cached) {
            return null;
        }

        if (cached.expiresAt <= Date.now()) {
            cacheStore.delete(key);
            return null;
        }

        return cached.data;
    }

    static set(key, data, ttlSeconds) {
        // 超出最大容量时移除最早写入的缓存项
        if (!cacheStore.has(key) && cacheStore.size >= MAX_SERVER_CACHE_ENTRIES) {
            const oldestKey = cacheStore.keys().next().value;
            if (oldestKey !== undefined) {
                cacheStore.delete(oldestKey);
            }
        }

        cacheStore.set(key, {
            data,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    static delete(key) {
        cacheStore.delete(key);
    }

    static clear() {
        cacheStore.clear();
    }
}
