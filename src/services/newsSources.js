/**
 * 合并本轮抓取结果：失败的来源在保留期内继续使用上一次的有效数据
 */
export function applySourceResults(previous = {}, results, now, maxAgeMs) {
    const snapshots = {};
    const staleSources = [];
    const unavailableSources = [];

    for (const { source, items } of results) {
        if (items.length > 0) {
            snapshots[source] = { items, fetchedAt: now };
            continue;
        }

        const retained = previous?.[source];
        if (retained?.items?.length > 0 && now - retained.fetchedAt <= maxAgeMs) {
            snapshots[source] = retained;
            staleSources.push(source);
        } else {
            unavailableSources.push(source);
        }
    }

    return { snapshots, staleSources, unavailableSources };
}

/**
 * 累计每个来源的成功率、耗时和最后成功时间
 */
export function updateSourceHealth(previous = {}, results, now) {
    const health = {};

    for (const { source, items, durationMs, error } of results) {
        const record = previous?.[source] || { successes: 0, failures: 0, lastSuccessAt: null };
        const ok = items.length > 0;
        const successes = record.successes + (ok ? 1 : 0);
        const failures = record.failures + (ok ? 0 : 1);

        health[source] = {
            successes,
            failures,
            successRate: Number((successes / (successes + failures)).toFixed(3)),
            lastDurationMs: durationMs,
            lastItemCount: items.length,
            lastCheckedAt: now,
            lastSuccessAt: ok ? now : record.lastSuccessAt,
            lastError: ok ? null : error || '未返回有效内容',
        };
    }

    return health;
}

/**
 * 选出频道最新的常规视频，排除 Shorts
 */
export function selectChannelVideos(entries, limit) {
    const getTime = (entry) => new Date(entry.isoDate || entry.pubDate || 0).getTime() || 0;

    return entries
        .filter((entry) => entry.id && entry.link && !entry.link.includes('/shorts/'))
        .sort((a, b) => getTime(b) - getTime(a))
        .slice(0, limit);
}

/**
 * 为异步任务设置最长等待时间
 */
export function withDeadline(promise, timeoutMs, message = '来源抓取超时') {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
