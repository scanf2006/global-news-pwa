import { getCandidateCount } from '@/lib/feedModel';
import { readShared, writeShared } from '@/lib/sharedStore';
import { createStaleWhileRevalidate } from '@/lib/staleWhileRevalidate';
import { HackerNewsAdapter } from './hackerNewsAdapter';
import { limitItemsPerSource, rankNewsItems } from './newsRanking';
import { dedupeNewsItems, mergeSimilarNewsItems, normalizeNewsItems } from './newsNormalizer';
import { applySourceResults, updateSourceHealth, withDeadline } from './newsSources';
import { classifyItemTopic, getRegion, getRegions } from './newsTaxonomy';
import { RSSAdapter } from './rssAdapter';
import { RedditAdapter } from './redditAdapter';
import { TWITTER_SOURCE } from './serviceUtils';
import { translateItems } from './translationService';
import { TwitterAdapter } from './twitterAdapter';
import { WeiboAdapter } from './weiboAdapter';
import { YouTubeAdapter } from './youtubeAdapter';

const NEWS_FRESH_MS = 3 * 60 * 1000; // 3 分钟内视为最新
const NEWS_MAX_STALE_MS = 6 * 60 * 60 * 1000; // 6 小时内可先返回旧数据
const REFRESH_COOLDOWN_MS = 60 * 1000;
const SOURCE_RETENTION_MS = 6 * 60 * 60 * 1000;
const SOURCE_DEADLINE_MS = 12 * 1000;
const TRANSLATED_MERGE_THRESHOLD = 0.6;
const SHARED_SNAPSHOT_KEY = 'news:snapshot:v1';
const SHARED_SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;

function getSourceTasks() {
    return [
        ...RSSAdapter.sourceNames.map((source) => ({
            source,
            load: () => RSSAdapter.fetchTrending(source),
        })),
        ...(RedditAdapter.isConfigured()
            ? [{ source: 'Reddit', load: () => RedditAdapter.fetchTrending() }]
            : []),
        { source: 'Hacker News', load: () => HackerNewsAdapter.fetchTrending() },
        { source: TWITTER_SOURCE, load: () => TwitterAdapter.fetchTrending() },
        { source: '微博热搜', load: () => WeiboAdapter.fetchHotSearch() },
        { source: 'YouTube', load: () => YouTubeAdapter.fetchTrending() },
    ];
}

// 抓取并清洗单个来源，失败时返回空列表和错误信息
async function runSourceTask({ source, load }) {
    const startedAt = Date.now();

    try {
        const rawItems = await withDeadline(load(), SOURCE_DEADLINE_MS);
        const items = dedupeNewsItems(normalizeNewsItems(rawItems)).map((item, index) => ({
            ...item,
            rank: item.rank ?? index + 1,
        }));
        return { source, items, durationMs: Date.now() - startedAt, error: null };
    } catch (error) {
        return { source, items: [], durationMs: Date.now() - startedAt, error: error.message };
    }
}

// 只保留前端需要的字段，减小响应和本地缓存体积
function toClientItem(item) {
    return {
        id: item.id,
        source: item.source,
        sourceList: item.sourceList,
        titleOriginal: item.titleOriginal,
        titleTranslated: item.titleTranslated,
        url: item.url,
        timestamp: item.timestamp,
        hasPublishedTime: item.hasPublishedTime,
        views: item.views || null,
        hotScore: item.hotScore,
        region: getRegion(item.source),
        regions: [...new Set((item.sourceList || [item.source]).flatMap(getRegions))],
        topic: classifyItemTopic(item),
    };
}

/**
 * 执行一次完整抓取、合并、翻译和排序
 */
async function aggregateNews(previous) {
    const results = await Promise.all(getSourceTasks().map(runSourceTask));
    const now = Date.now();
    const { snapshots, staleSources, unavailableSources } = applySourceResults(
        previous?.sourceSnapshots,
        results,
        now,
        SOURCE_RETENTION_MS
    );

    const validNews = dedupeNewsItems(Object.values(snapshots).flatMap(({ items }) => items));
    const candidates = limitItemsPerSource(
        rankNewsItems(mergeSimilarNewsItems(validNews), now),
        getCandidateCount
    );

    try {
        await translateItems(candidates);
    } catch (error) {
        console.error('批量翻译服务异常:', error);
    }

    // 翻译后再按中文标题合并一次，匹配不同语言对同一事件的报道
    const merged = mergeSimilarNewsItems(candidates, {
        getTitle: (item) => item.titleTranslated,
        threshold: TRANSLATED_MERGE_THRESHOLD,
        crossSourceOnly: true,
    });

    return {
        items: rankNewsItems(merged, now).map(toClientItem),
        unavailableSources,
        staleSources,
        sourceSnapshots: snapshots,
        sourceHealth: updateSourceHealth(previous?.sourceHealth, results, now),
    };
}

const getAggregatedNews = createStaleWhileRevalidate({
    load: aggregateNews,
    isUsable: (result) => result?.items?.length > 0,
    emptyValue: { items: [], unavailableSources: [], staleSources: [] },
    freshMs: NEWS_FRESH_MS,
    maxStaleMs: NEWS_MAX_STALE_MS,
    refreshCooldownMs: REFRESH_COOLDOWN_MS,
    readSnapshot: () => readShared(SHARED_SNAPSHOT_KEY),
    writeSnapshot: (snapshot) =>
        writeShared(SHARED_SNAPSHOT_KEY, snapshot, SHARED_SNAPSHOT_TTL_SECONDS),
});

export const NewsAggregator = {
    fetchAllNews({ forceRefresh = false, runInBackground } = {}) {
        return getAggregatedNews({ force: forceRefresh, runInBackground });
    },
};
