const HOUR_MS = 60 * 60 * 1000;
const MULTI_SOURCE_WEIGHT = 40;
const RECENCY_WEIGHT = 30;
const RECENCY_HALF_LIFE_HOURS = 8;
const TRENDING_BASE_SCORE = 12;
const RANK_WEIGHT = 25;
const RANK_RANGE = 30;
const ENGAGEMENT_WEIGHT = 3;
const MAX_ENGAGEMENT_SCORE = 20;

/**
 * 解析 5.2M、12K、3.4万、1亿、12345 等热度文本
 */
export function parseViewCount(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    const match = String(value || '')
        .replace(/,/g, '')
        .match(/(\d+(?:\.\d+)?)\s*([kKmMbB万亿])?/);
    if (!match) {
        return 0;
    }

    const multipliers = { k: 1e3, m: 1e6, b: 1e9, 万: 1e4, 亿: 1e8 };
    return Number(match[1]) * (multipliers[match[2]?.toLowerCase()] || 1);
}

/**
 * 综合来源数量、发布时间、榜单名次和互动量计算热度分
 */
export function computeHotScore(item, now = Date.now()) {
    const sourceCount = item.sourceList?.length || 1;
    let score = (sourceCount - 1) * MULTI_SOURCE_WEIGHT;

    if (item.hasPublishedTime === false) {
        const rank = item.rank || RANK_RANGE;
        score += TRENDING_BASE_SCORE;
        score += RANK_WEIGHT * Math.max(0, 1 - (rank - 1) / RANK_RANGE);
    } else {
        const ageHours = Math.max(0, (now - new Date(item.timestamp).getTime()) / HOUR_MS);
        score += RECENCY_WEIGHT * 0.5 ** (ageHours / RECENCY_HALF_LIFE_HOURS);
    }

    const views = parseViewCount(item.views);
    if (views > 0) {
        score += Math.min(MAX_ENGAGEMENT_SCORE, Math.log10(views + 1) * ENGAGEMENT_WEIGHT);
    }

    return Number(score.toFixed(2));
}

/**
 * 计算热度分并按分数倒序排列
 */
export function rankNewsItems(items, now = Date.now()) {
    return items
        .map((item) => ({ ...item, hotScore: computeHotScore(item, now) }))
        .sort((a, b) => b.hotScore - a.hotScore);
}

/**
 * 限制每个主来源返回的条目数量，maxPerSource 可按来源传入函数
 */
export function limitItemsPerSource(items, maxPerSource) {
    const counts = new Map();
    const getLimit = typeof maxPerSource === 'function' ? maxPerSource : () => maxPerSource;

    return items.filter((item) => {
        const count = counts.get(item.source) || 0;
        counts.set(item.source, count + 1);
        return count < getLimit(item.source);
    });
}
