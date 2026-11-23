import { compareNewsItems } from '../services/serviceUtils.js';

export const DISPLAY_COUNT_PER_SOURCE = 5;
export const RESERVE_COUNT_PER_SOURCE = 10;
export const EMPTY_FEED = { displayed: [], reserve: {} };
export const DEFAULT_FILTERS = { query: '', source: '', region: '', topic: '' };

const WEIBO_SOURCE = '微博热搜';
const WEIBO_PINNED_COUNT = 3;
const CORE_CANDIDATE_COUNT = 18; // 展示 5 条 + 替补 10 条 + 微博跳过的 3 条
const SUPPLEMENTAL_DISPLAY_COUNT = 3;
const SUPPLEMENTAL_CANDIDATE_COUNT = 8;

// 补充来源配额较低，避免卡片过多，也控制翻译量
const SUPPLEMENTAL_SOURCES = new Set([
    'DW',
    'France 24',
    'CNA',
    'SCMP',
    'BBC 中文',
    'DW 中文',
    'RFI 中文',
    'CityNews Toronto',
    'Globe and Mail',
    'IT之家',
    'CNBC',
    'The Verge',
    'Hacker News',
]);

export function getDisplayCount(source) {
    return SUPPLEMENTAL_SOURCES.has(source) ? SUPPLEMENTAL_DISPLAY_COUNT : DISPLAY_COUNT_PER_SOURCE;
}

export function getCandidateCount(source) {
    return SUPPLEMENTAL_SOURCES.has(source) ? SUPPLEMENTAL_CANDIDATE_COUNT : CORE_CANDIDATE_COUNT;
}

/**
 * 按来源分组生成展示列表与替补池
 */
export function buildFeed(items, deletedIds = []) {
    const deletedSet = new Set(deletedIds);
    const groups = new Map();

    for (const item of items) {
        if (deletedSet.has(item.id)) {
            continue;
        }

        const source = item.source || 'Other';
        if (!groups.has(source)) {
            groups.set(source, []);
        }
        groups.get(source).push(item);
    }

    const displayed = [];
    const reserve = {};

    for (const [source, sourceItems] of groups) {
        // 微博热搜跳过前 3 条置顶内容
        const usable = source === WEIBO_SOURCE ? sourceItems.slice(WEIBO_PINNED_COUNT) : sourceItems;
        const displayCount = getDisplayCount(source);
        displayed.push(...usable.slice(0, displayCount));
        reserve[source] = usable.slice(displayCount, displayCount + RESERVE_COUNT_PER_SOURCE);
    }

    return { displayed, reserve };
}

/**
 * 移除卡片并从同源替补池补位
 */
export function removeFromFeed(feed, id, source) {
    const removed = feed.displayed.find((item) => item.id === id) || null;
    if (!removed) {
        return { feed, removed: null, replacement: null };
    }

    const remaining = feed.displayed.filter((item) => item.id !== id);
    const [replacement = null, ...restReserve] = feed.reserve[source] || [];

    if (!replacement) {
        return { feed: { ...feed, displayed: remaining }, removed, replacement: null };
    }

    return {
        feed: {
            displayed: [...remaining, replacement],
            reserve: { ...feed.reserve, [source]: restReserve },
        },
        removed,
        replacement,
    };
}

/**
 * 撤销删除：放回原卡片，并把补位条目退回替补池
 */
export function restoreToFeed(feed, removed, replacement) {
    if (!removed || feed.displayed.some((item) => item.id === removed.id)) {
        return feed;
    }

    const displayed = feed.displayed.filter((item) => item.id !== replacement?.id);
    const reserve = { ...feed.reserve };

    if (replacement && displayed.length < feed.displayed.length) {
        reserve[removed.source] = [replacement, ...(reserve[removed.source] || [])];
    }

    return { displayed: [...displayed, removed], reserve };
}

export function sortFeedItems(items, sortMode = 'hot') {
    const sorted = [...items];
    return sortMode === 'latest'
        ? sorted.sort(compareNewsItems)
        : sorted.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
}

export function hasActiveFilters(filters) {
    return Boolean(filters.query.trim() || filters.source || filters.region || filters.topic);
}

/**
 * 按关键词、来源、地区和主题筛选
 */
export function filterNews(items, filters) {
    const query = filters.query.trim().toLowerCase();

    return items.filter((item) => {
        const sources = item.sourceList || [item.source];
        if (filters.source && !sources.includes(filters.source)) {
            return false;
        }
        if (filters.region && !(item.regions || [item.region]).includes(filters.region)) {
            return false;
        }
        if (filters.topic && item.topic !== filters.topic) {
            return false;
        }
        if (!query) {
            return true;
        }

        return `${item.titleTranslated || ''} ${item.titleOriginal || ''}`
            .toLowerCase()
            .includes(query);
    });
}

/**
 * 统计新数据中当前没有的条目数量
 */
export function countNewItems(currentItems, nextItems, deletedIds = []) {
    const known = new Set([...currentItems.map((item) => item.id), ...deletedIds]);
    return nextItems.filter((item) => !known.has(item.id)).length;
}
