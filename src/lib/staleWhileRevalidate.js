/**
 * 创建“先返回旧数据、后台更新”的加载器。
 * 并发刷新共享同一任务，刷新失败时继续使用最后一份有效数据。
 */
export function createStaleWhileRevalidate({
    load,
    isUsable,
    emptyValue,
    freshMs,
    maxStaleMs,
    refreshCooldownMs,
    now = Date.now,
}) {
    let entry = null;
    let inFlight = null;
    let lastAttemptAt = -Infinity;

    const toResult = (stale) => ({ ...entry.value, updatedAt: entry.updatedAt, stale });

    const refresh = () => {
        if (!inFlight) {
            lastAttemptAt = now();
            inFlight = Promise.resolve()
                .then(load)
                .then((value) => {
                    if (isUsable(value)) {
                        entry = { value, updatedAt: now() };
                        return { ok: true, value };
                    }
                    return { ok: false, value };
                })
                .catch((error) => {
                    console.error('[SWR] 刷新失败:', error);
                    return { ok: false, value: emptyValue };
                })
                .finally(() => {
                    inFlight = null;
                });
        }

        return inFlight;
    };

    return async function get({ force = false, runInBackground } = {}) {
        const age = entry ? now() - entry.updatedAt : Infinity;
        const isFresh = age < freshMs;
        const canServeStale = age <= maxStaleMs;
        const cooldownPassed = now() - lastAttemptAt >= refreshCooldownMs;

        if (canServeStale && (!force || !cooldownPassed)) {
            if (!isFresh && cooldownPassed) {
                const task = refresh();
                runInBackground?.(() => task);
            }
            return toResult(!isFresh);
        }

        const latest = await refresh();
        if (latest.ok) {
            return toResult(false);
        }

        if (canServeStale) {
            return toResult(true);
        }

        return { ...(latest.value || emptyValue), updatedAt: null, stale: false };
    };
}
