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
    readSnapshot,
    writeSnapshot,
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
                .then(() => load(entry?.value))
                .then(async (value) => {
                    if (isUsable(value)) {
                        entry = { value, updatedAt: now() };
                        await writeSnapshot?.(entry);
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

    // 本实例没有最新数据时，尝试采用其他实例写入的共享快照
    const adoptSnapshot = async () => {
        if (!readSnapshot) {
            return;
        }

        try {
            const snapshot = await readSnapshot();
            if (
                isUsable(snapshot?.value) &&
                Number.isFinite(snapshot.updatedAt) &&
                (!entry || snapshot.updatedAt > entry.updatedAt)
            ) {
                entry = snapshot;
            }
        } catch (error) {
            console.warn('[SWR] 读取共享快照失败:', error);
        }
    };

    return async function get({ force = false, runInBackground } = {}) {
        if (!entry || now() - entry.updatedAt >= freshMs) {
            await adoptSnapshot();
        }

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
