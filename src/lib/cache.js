const DEFAULT_CACHE_DURATION = 10 * 60 * 1000;
const CACHE_PREFIX = 'api_cache_';

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
            console.error('[Cache] Error reading cache:', error);
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
            console.error('[Cache] Error writing cache:', error);
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
                    console.error('[Cache] Retry failed:', retryError);
                }
            }
        }
    }

    static remove(key) {
        try {
            localStorage.removeItem(CACHE_PREFIX + key);
        } catch (error) {
            console.error('[Cache] Error removing cache:', error);
        }
    }

    static clear() {
        try {
            Object.keys(localStorage)
                .filter((key) => key.startsWith(CACHE_PREFIX))
                .forEach((key) => localStorage.removeItem(key));
        } catch (error) {
            console.error('[Cache] Error clearing cache:', error);
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
            console.error('[Cache] Error clearing old cache:', error);
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
            console.error('[Cache] Error getting cache info:', error);
            return null;
        }
    }
}
