import { RSSAdapter } from './rssAdapter';
import { RedditAdapter } from './redditAdapter';
import { TwitterAdapter } from './twitterAdapter';
import { WeiboAdapter } from './weiboAdapter';
import { YouTubeAdapter } from './youtubeAdapter';
import {
    calculateTokenSimilarity,
    containsCjk,
    isLikelyUsefulTitle,
    normalizeTitle,
} from './serviceUtils';

const translationCache = new Map();
const SIMILARITY_THRESHOLD = 0.72;
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MERGED_SOURCE_LABEL = '多源热点';

function getItemDedupKey(item) {
    const normalizedTitle = normalizeTitle(item.titleOriginal || item.titleTranslated);
    const url = item.url || '';
    return `${item.source}|${normalizedTitle}|${url}`;
}

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

function mergeSimilarNewsItems(items) {
    const mergedItems = [];

    for (const item of items) {
        const matchingItem = mergedItems.find((existingItem) => {
            const timeDistance = Math.abs(new Date(existingItem.timestamp) - new Date(item.timestamp));
            if (timeDistance > MERGE_WINDOW_MS) {
                return false;
            }

            const exactMatch = normalizeTitle(existingItem.titleOriginal) === normalizeTitle(item.titleOriginal);
            if (exactMatch) {
                return true;
            }

            return calculateTokenSimilarity(existingItem.titleOriginal, item.titleOriginal) >= SIMILARITY_THRESHOLD;
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

    return mergedItems.map((item) => ({
        ...item,
        source: item.sourceList.length > 1 ? MERGED_SOURCE_LABEL : item.source,
    }));
}

async function translateWithGoogleApiX(text) {
    const { translate } = await import('google-translate-api-x');
    const result = await translate(text, { to: 'zh-CN' });
    return result?.text || '';
}

async function translateWithGoogleEndpoint(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json,text/plain,*/*',
            'User-Agent': 'Mozilla/5.0',
        },
    });

    if (!response.ok) {
        throw new Error(`Google endpoint returned ${response.status}`);
    }

    const payload = await response.json();
    const translated = payload?.[0]
        ?.map((segment) => segment?.[0] || '')
        .join('')
        .trim();

    return translated || '';
}

async function translateText(text) {
    try {
        const translated = await translateWithGoogleApiX(text);
        if (translated && translated !== text) {
            return translated;
        }
    } catch (error) {
        console.warn('[Translation] google-translate-api-x failed:', error.message);
    }

    const fallbackTranslated = await translateWithGoogleEndpoint(text);
    return fallbackTranslated || text;
}

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
                    translationCache.set(item.titleOriginal, finalText);
                    item.titleTranslated = finalText;
                } catch (error) {
                    console.error('Translation failed for item:', item.id, error.message);
                    item.titleTranslated = item.titleOriginal;
                }
            })
        );
    }
}

export const NewsAggregator = {
    async fetchAllNews() {
        try {
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
                console.error('Translation service error:', error);
            }

            return mergedNews;
        } catch (error) {
            console.error('NewsAggregator Error:', error);
            return [];
        }
    },
};
