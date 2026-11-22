import { ServerCache } from '@/lib/serverCache';
import { RSSAdapter } from './rssAdapter';
import { RedditAdapter } from './redditAdapter';
import { TwitterAdapter } from './twitterAdapter';
import { WeiboAdapter } from './weiboAdapter';
import { YouTubeAdapter } from './youtubeAdapter';
import { dedupeNewsItems, mergeSimilarNewsItems, normalizeNewsItems } from './newsNormalizer';
import { TWITTER_SOURCE, compareNewsItems, containsCjk, fetchWithTimeout } from './serviceUtils';

const translationCache = new Map();
const MAX_TRANSLATION_CACHE_SIZE = 1000;
const AGGREGATED_NEWS_CACHE_KEY = 'aggregated_all_news';
const AGGREGATED_NEWS_TTL_SECONDS = 180; // 服务端聚合缓存 3 分钟
const FORCE_REFRESH_COOLDOWN_MS = 60 * 1000;
const MAX_TRANSLATED_ITEMS_PER_SOURCE = 15; // 与前端展示数 + 替补数保持一致
const TRANSLATION_CONCURRENCY = 6;
const TRANSLATION_REQUEST_TIMEOUT_MS = 3000;
const TRANSLATION_BUDGET_MS = 8000;
const NON_RSS_SOURCES = ['Reddit', TWITTER_SOURCE, '微博热搜', 'YouTube'];

let inFlightAggregation = null;
let lastSuccessfulRefreshAt = 0;

/**
 * 写入翻译缓存并控制最大容量，防止长期运行内存无限增长
 */
function setTranslationCache(originalText, translatedText) {
    if (!translationCache.has(originalText) && translationCache.size >= MAX_TRANSLATION_CACHE_SIZE) {
        const oldestKey = translationCache.keys().next().value;
        if (oldestKey !== undefined) {
            translationCache.delete(oldestKey);
        }
    }
    translationCache.set(originalText, translatedText);
}

/**
 * 使用 google-translate-api-x 进行标题翻译
 */
async function translateWithGoogleApiX(text) {
    const { translate } = await import('google-translate-api-x');
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error('翻译请求超时')),
            TRANSLATION_REQUEST_TIMEOUT_MS
        );
    });

    try {
        const result = await Promise.race([translate(text, { to: 'zh-CN' }), timeout]);
        return result?.text || '';
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 使用 Google 翻译公共接口作为备用翻译通道
 */
async function translateWithGoogleEndpoint(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetchWithTimeout(
        url,
        {
            headers: {
                Accept: 'application/json,text/plain,*/*',
                'User-Agent': 'Mozilla/5.0',
            },
        },
        TRANSLATION_REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
        throw new Error(`Google 翻译接口返回状态码 ${response.status}`);
    }

    const payload = await response.json();
    const translated = payload?.[0]
        ?.map((segment) => segment?.[0] || '')
        .join('')
        .trim();

    return translated || '';
}

/**
 * 翻译单条文本（优先使用主翻译库，失败时回退到备用接口）
 */
async function translateText(text) {
    try {
        const translated = await translateWithGoogleApiX(text);
        if (translated && translated !== text) {
            return translated;
        }
    } catch (error) {
        console.warn('[Translation] google-translate-api-x 翻译失败:', error.message);
    }

    return translateWithGoogleEndpoint(text);
}

/**
 * 批量并发翻译非中文新闻标题。
 * 每个来源只翻译前端可能展示的条目，优先翻译靠前内容，超出时间预算的条目保留原文。
 */
async function translateBatch(items) {
    const translateQueue = [];
    const sourcePositions = new Map();

    for (const item of items) {
        if (!item.titleOriginal) {
            continue;
        }

        const position = sourcePositions.get(item.source) || 0;
        sourcePositions.set(item.source, position + 1);

        if (containsCjk(item.titleOriginal)) {
            item.titleTranslated = item.titleOriginal;
            continue;
        }

        if (translationCache.has(item.titleOriginal)) {
            item.titleTranslated = translationCache.get(item.titleOriginal);
            continue;
        }

        if (position < MAX_TRANSLATED_ITEMS_PER_SOURCE) {
            translateQueue.push({ item, position });
        }
    }

    const orderedQueue = translateQueue
        .sort((a, b) => a.position - b.position)
        .map(({ item }) => item);
    const deadline = Date.now() + TRANSLATION_BUDGET_MS;

    for (let index = 0; index < orderedQueue.length; index += TRANSLATION_CONCURRENCY) {
        if (Date.now() >= deadline) {
            console.warn(`[Translation] 超出时间预算，剩余 ${orderedQueue.length - index} 条保留原文`);
            break;
        }

        const chunk = orderedQueue.slice(index, index + TRANSLATION_CONCURRENCY);
        await Promise.allSettled(
            chunk.map(async (item) => {
                try {
                    const translated = await translateText(item.titleOriginal);
                    // 空结果视为失败，不写入缓存，下次刷新时重试
                    if (translated) {
                        setTranslationCache(item.titleOriginal, translated);
                    }
                    item.titleTranslated = translated || item.titleOriginal;
                } catch (error) {
                    console.error('条目翻译失败:', item.id, error.message);
                    item.titleTranslated = item.titleOriginal;
                }
            })
        );
    }
}

/**
 * 执行一次完整抓取、合并与翻译
 */
async function aggregateNews() {
    const settledResults = await Promise.allSettled([
        RSSAdapter.fetchAll(),
        RedditAdapter.fetchTrending(),
        TwitterAdapter.fetchTrending(),
        WeiboAdapter.fetchHotSearch(),
        YouTubeAdapter.fetchTrending(),
    ]);

    const allNews = settledResults
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => result.value);

    const validNews = dedupeNewsItems(normalizeNewsItems(allNews));
    const availableSources = new Set(validNews.map((item) => item.source));
    const unavailableSources = [...RSSAdapter.sourceNames, ...NON_RSS_SOURCES].filter(
        (source) => !availableSources.has(source)
    );

    const items = mergeSimilarNewsItems(validNews).sort(compareNewsItems);

    try {
        await translateBatch(items);
    } catch (error) {
        console.error('批量翻译服务异常:', error);
    }

    const result = { items, unavailableSources };

    if (items.length > 0) {
        ServerCache.set(AGGREGATED_NEWS_CACHE_KEY, result, AGGREGATED_NEWS_TTL_SECONDS);
        lastSuccessfulRefreshAt = Date.now();
    }

    return result;
}

export const NewsAggregator = {
    async fetchAllNews({ forceRefresh = false } = {}) {
        // 强制刷新也受冷却时间限制，防止接口被反复触发全量抓取
        const canBypassCache =
            forceRefresh && Date.now() - lastSuccessfulRefreshAt >= FORCE_REFRESH_COOLDOWN_MS;

        if (!canBypassCache) {
            const cachedResult = ServerCache.get(AGGREGATED_NEWS_CACHE_KEY);
            if (cachedResult?.items?.length > 0) {
                return cachedResult;
            }
        }

        // 并发请求共享同一次抓取
        if (!inFlightAggregation) {
            inFlightAggregation = aggregateNews()
                .catch((error) => {
                    console.error('NewsAggregator 聚合异常:', error);
                    return { items: [], unavailableSources: [] };
                })
                .finally(() => {
                    inFlightAggregation = null;
                });
        }

        return inFlightAggregation;
    },
};
