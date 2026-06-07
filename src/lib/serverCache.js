const cacheStore = new Map();

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
        cacheStore.set(key, {
            data,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }
}
