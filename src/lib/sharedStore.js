import { fetchWithTimeout } from '../services/serviceUtils.js';

const SHARED_STORE_TIMEOUT_MS = 2500;

// 兼容 Upstash Redis 与 Vercel KV 的 REST 环境变量
function getStoreConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function isSharedStoreEnabled() {
    return Boolean(getStoreConfig());
}

/**
 * 读取共享缓存；未配置或请求失败时返回 null
 */
export async function readShared(key) {
    const config = getStoreConfig();
    if (!config) {
        return null;
    }

    try {
        const response = await fetchWithTimeout(
            `${config.url}/get/${encodeURIComponent(key)}`,
            { headers: { Authorization: `Bearer ${config.token}` }, cache: 'no-store' },
            SHARED_STORE_TIMEOUT_MS
        );
        if (!response.ok) {
            throw new Error(`状态码 ${response.status}`);
        }

        const { result } = await response.json();
        return result ? JSON.parse(result) : null;
    } catch (error) {
        console.warn('[SharedStore] 读取失败:', error.message);
        return null;
    }
}

/**
 * 写入共享缓存；失败时只记录日志，不影响主流程
 */
export async function writeShared(key, value, ttlSeconds) {
    const config = getStoreConfig();
    if (!config) {
        return false;
    }

    try {
        const response = await fetchWithTimeout(
            `${config.url}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${config.token}` },
                body: JSON.stringify(value),
                cache: 'no-store',
            },
            SHARED_STORE_TIMEOUT_MS
        );
        if (!response.ok) {
            throw new Error(`状态码 ${response.status}`);
        }
        return true;
    } catch (error) {
        console.warn('[SharedStore] 写入失败:', error.message);
        return false;
    }
}
