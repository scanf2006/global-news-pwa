import {
    TWITTER_SOURCE,
    calculateTokenSimilarity,
    isLikelyUsefulTitle,
    normalizeTitle,
    sanitizeHttpUrl,
} from './serviceUtils.js';

const SIMILARITY_THRESHOLD = 0.72;
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000;

// 热榜类来源没有真实发布时间，只能记录抓取时间
const TRENDING_SOURCES = new Set([TWITTER_SOURCE, '微博热搜']);

/**
 * 统一条目的链接与时间字段，丢弃非 http(s) 链接
 */
export function normalizeNewsItems(items, fetchedAt = new Date().toISOString()) {
    return items.flatMap((item) => {
        const url = sanitizeHttpUrl(item?.url);
        if (!url) {
            return [];
        }

        const publishedMs = new Date(item.timestamp).getTime();
        const hasPublishedTime =
            !TRENDING_SOURCES.has(item.source) && item.timestamp != null && !Number.isNaN(publishedMs);

        return [
            {
                ...item,
                url,
                hasPublishedTime,
                timestamp: hasPublishedTime ? new Date(publishedMs).toISOString() : fetchedAt,
            },
        ];
    });
}

/**
 * 过滤无效条目，并按 ID 及“来源 + 标题 + 链接”去重
 */
export function dedupeNewsItems(items) {
    const seen = new Set();
    const dedupedItems = [];

    for (const item of items) {
        if (
            !item?.url ||
            !isLikelyUsefulTitle(item.titleOriginal || item.titleTranslated, item.source)
        ) {
            continue;
        }

        const normalizedTitle = normalizeTitle(item.titleOriginal || item.titleTranslated);
        const key = `${item.source}|${normalizedTitle}|${item.url}`;
        if (seen.has(key) || seen.has(`id:${item.id}`)) {
            continue;
        }

        seen.add(key);
        seen.add(`id:${item.id}`);
        dedupedItems.push(item);
    }

    return dedupedItems;
}

/**
 * 合并 24 小时内标题高度相似的多源热点新闻
 * 保留首个主来源作为 item.source，全部来源记录在 sourceList 中
 */
export function mergeSimilarNewsItems(items) {
    const mergedItems = [];

    for (const item of items) {
        const matchingItem = mergedItems.find((existingItem) => {
            const timeDistance = Math.abs(
                new Date(existingItem.timestamp) - new Date(item.timestamp)
            );
            if (timeDistance > MERGE_WINDOW_MS) {
                return false;
            }

            return (
                normalizeTitle(existingItem.titleOriginal) === normalizeTitle(item.titleOriginal) ||
                calculateTokenSimilarity(existingItem.titleOriginal, item.titleOriginal) >=
                    SIMILARITY_THRESHOLD
            );
        });

        if (!matchingItem) {
            mergedItems.push({ ...item, sourceList: [item.source] });
            continue;
        }

        matchingItem.sourceList = Array.from(new Set([...matchingItem.sourceList, item.source]));

        // 真实发布时间优先于热榜抓取时间
        if (
            item.hasPublishedTime &&
            (!matchingItem.hasPublishedTime ||
                new Date(item.timestamp) > new Date(matchingItem.timestamp))
        ) {
            matchingItem.timestamp = item.timestamp;
            matchingItem.hasPublishedTime = true;
        }

        if (!matchingItem.views && item.views) {
            matchingItem.views = item.views;
        }
    }

    return mergedItems;
}
