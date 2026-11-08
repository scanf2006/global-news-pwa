import { ServerCache } from '@/lib/serverCache';
import { RSSAdapter } from './rssAdapter';
import { RedditAdapter } from './redditAdapter';
import { TwitterAdapter } from './twitterAdapter';
import { WeiboAdapter } from './weiboAdapter';
import { YouTubeAdapter } from './youtubeAdapter';
import {
    calculateTokenSimilarity,
    containsCjk,
    fetchWithTimeout,
    isLikelyUsefulTitle,
    normalizeTitle,
} from './serviceUtils';

const translationCache = new Map();
const MAX_TRANSLATION_CACHE_SIZE = 1000;
const AGGREGATED_NEWS_CACHE_KEY = 'aggregated_all_news';
const AGGREGATED_NEWS_TTL_SECONDS = 180; // 服务端聚合缓存 3 分钟
const SIMILARITY_THRESHOLD = 0.72;
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
 * 生成单条新闻的去重键
 */
function getItemDedupKey(item) {
    const normalizedTitle = normalizeTitle(item.titleOriginal || item.titleTranslated);
    const url = item.url || '';
    return `${item.source}|${normalizedTitle}|${url}`;
}

/**
 * 过滤无效条目并按去重键去重
 */
function dedupeNewsItems(items) {
    const seen = new Set();
    const dedupedItems = [];

    for (const item of items) {
        if (!item?.url || !isLikelyUsefulTitle(item.titleOriginal || item.titleTranslated)) {
            continue;
        }

        const key = getItemDedupKey(item);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        dedupedItems.push(item);
    }

    return dedupedItems;
}

/**
 * 合并 24 小时内标题高度相似的多源热点新闻
 * 保留首个主来源作为 item.source 以便前端分组与备用池正常替换，同时将全部来源记录在 sourceList 中
 */
function mergeSimilarNewsItems(items) {
    const mergedItems = [];

    for (const item of items) {
        const matchingItem = mergedItems.find((existingItem) => {
            const timeDistance = Math.abs(
                new Date(existingItem.timestamp) - new Date(item.timestamp)
            );
            if (timeDistance > MERGE_WINDOW_MS) {
                return false;
            }

            const exactMatch =
                normalizeTitle(existingItem.titleOriginal) === normalizeTitle(item.titleOriginal);
            if (exactMatch) {
                return true;
            }

            return (
                calculateTokenSimilarity(existingItem.titleOriginal, item.titleOriginal) >=
                SIMILARITY_THRESHOLD
            );
        });

        if (!matchingItem) {
            mergedItems.push({
                ...item,
                sourceList: [item.source],
            });
            continue;
        }

        matchingItem.sourceList = Array.from(
            new Set([...(matchingItem.sourceList || [matchingItem.source]), item.source])
        );

        if (new Date(item.timestamp) > new Date(matchingItem.timestamp)) {
            matchingItem.timestamp = item.timestamp;
        }

        if (!matchingItem.views && item.views) {
            matchingItem.views = item.views;
        }
    }

    return mergedItems;
}

/**
 * 使用 google-translate-api-x 进行标题翻译
 */
async function translateWithGoogleApiX(text) {
    const { translate } = await import('google-translate-api-x');
    const result = await translate(text, { to: 'zh-CN' });
    return result?.text || '';
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
        6000
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

    const fallbackTranslated = await translateWithGoogleEndpoint(text);
    return fallbackTranslated || text;
}

/**
 * 批量并发翻译非中文新闻标题
 */
async function translateBatch(items) {
    const translateQueue = [];

    for (const item of items) {
        if (!item.titleOriginal) {
            continue;
        }

        if (containsCjk(item.titleOriginal)) {
            item.titleTranslated = item.titleOriginal;
            continue;
        }

        if (translationCache.has(item.titleOriginal)) {
            item.titleTranslated = translationCache.get(item.titleOriginal);
            continue;
        }

        translateQueue.push(item);
    }

    for (let index = 0; index < translateQueue.length; index += 6) {
        const chunk = translateQueue.slice(index, index + 6);
        await Promise.allSettled(
            chunk.map(async (item) => {
                try {
                    const translated = await translateText(item.titleOriginal);
                    const finalText = translated || item.titleOriginal;
                    setTranslationCache(item.titleOriginal, finalText);
                    item.titleTranslated = finalText;
                } catch (error) {
                    console.error('条目翻译失败:', item.id, error.message);
                    item.titleTranslated = item.titleOriginal;
                }
            })
        );
    }
}

export const NewsAggregator = {
    async fetchAllNews({ forceRefresh = false } = {}) {
        try {
            // 非强制刷新时优先返回服务端内存缓存
            if (!forceRefresh) {
                const cachedNews = ServerCache.get(AGGREGATED_NEWS_CACHE_KEY);
                if (Array.isArray(cachedNews) && cachedNews.length > 0) {
                    return cachedNews;
                }
            }

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

            const mergedNews = mergeSimilarNewsItems(dedupeNewsItems(allNews)).sort(
                (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
            );

            try {
                await translateBatch(mergedNews);
            } catch (error) {
                console.error('批量翻译服务异常:', error);
            }

            if (mergedNews.length > 0) {
                ServerCache.set(
                    AGGREGATED_NEWS_CACHE_KEY,
                    mergedNews,
                    AGGREGATED_NEWS_TTL_SECONDS
                );
            }

            return mergedNews;
        } catch (error) {
            console.error('NewsAggregator 聚合异常:', error);
            return [];
        }
    },
};
