const DEFAULT_CACHE_DURATION = 10 * 60 * 1000;
const CACHE_PREFIX = 'api_cache_';

// 客户端 localStorage 接口缓存管理类
export class APICache {
    static get(key) {
        try {
            const cacheKey = CACHE_PREFIX + key;
            const cached = localStorage.getItem(cacheKey);

            if (!cached) {
                return null;
            }

            const { data, timestamp, ttl = DEFAULT_CACHE_DURATION } = JSON.parse(cached);
            const age = Date.now() - timestamp;

            if (age > ttl) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            return data;
        } catch (error) {
            console.error('[Cache] 读取缓存失败:', error);
            return null;
        }
    }

    static set(key, data, ttl = DEFAULT_CACHE_DURATION) {
        try {
            const cacheKey = CACHE_PREFIX + key;
            const cacheData = {
                data,
                timestamp: Date.now(),
                ttl,
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (error) {
            console.error('[Cache] 写入缓存失败:', error);
            if (error.name === 'QuotaExceededError') {
                this.clearOldCache();

                try {
                    const cacheKey = CACHE_PREFIX + key;
                    const cacheData = {
                        data,
                        timestamp: Date.now(),
                        ttl,
                    };
                    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                } catch (retryError) {
                    console.error('[Cache] 重试写入缓存失败:', retryError);
                }
            }
        }
    }

    static remove(key) {
        try {
            localStorage.removeItem(CACHE_PREFIX + key);
        } catch (error) {
            console.error('[Cache] 删除缓存失败:', error);
        }
    }

    static clear() {
        try {
            Object.keys(localStorage)
                .filter((key) => key.startsWith(CACHE_PREFIX))
                .forEach((key) => localStorage.removeItem(key));
        } catch (error) {
            console.error('[Cache] 清空缓存失败:', error);
        }
    }

    static clearOldCache() {
        try {
            Object.keys(localStorage)
                .filter((key) => key.startsWith(CACHE_PREFIX))
                .forEach((key) => {
                    try {
                        const cached = localStorage.getItem(key);
                        if (!cached) {
                            return;
                        }

                        const { timestamp, ttl = DEFAULT_CACHE_DURATION } = JSON.parse(cached);
                        if (Date.now() - timestamp > ttl) {
                            localStorage.removeItem(key);
                        }
                    } catch {
                        localStorage.removeItem(key);
                    }
                });
        } catch (error) {
            console.error('[Cache] 清理过期缓存失败:', error);
        }
    }

    static getInfo(key) {
        try {
            const cached = localStorage.getItem(CACHE_PREFIX + key);
            if (!cached) {
                return null;
            }

            const { timestamp, ttl = DEFAULT_CACHE_DURATION } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            const remaining = ttl - age;

            return {
                age,
                remaining: remaining > 0 ? remaining : 0,
                expired: age > ttl,
                timestamp,
            };
        } catch (error) {
            console.error('[Cache] 获取缓存信息失败:', error);
            return null;
        }
    }
}
