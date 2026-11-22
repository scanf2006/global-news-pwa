import { readShared, writeShared } from '../lib/sharedStore.js';
import { containsCjk, fetchWithTimeout } from './serviceUtils.js';

const MAX_TRANSLATION_CACHE_SIZE = 2000;
const TRANSLATION_CONCURRENCY = 6;
const TRANSLATION_REQUEST_TIMEOUT_MS = 3000;
const TRANSLATION_BUDGET_MS = 8000;
const OFFICIAL_BATCH_SIZE = 50;
const OFFICIAL_TIMEOUT_MS = 6000;
const SHARED_TRANSLATIONS_KEY = 'news:translations:v1';
const SHARED_TRANSLATIONS_TTL_SECONDS = 30 * 24 * 60 * 60;

const translationCache = new Map();
let hydratePromise = null;

function setCachedTranslation(original, translated) {
    if (!translationCache.has(original) && translationCache.size >= MAX_TRANSLATION_CACHE_SIZE) {
        translationCache.delete(translationCache.keys().next().value);
    }
    translationCache.set(original, translated);
}

// 每个实例只从共享缓存加载一次译文
function hydrateTranslations() {
    if (!hydratePromise) {
        hydratePromise = readShared(SHARED_TRANSLATIONS_KEY).then((stored) => {
            for (const [original, translated] of Object.entries(stored || {})) {
                if (!translationCache.has(original)) {
                    setCachedTranslation(original, translated);
                }
            }
        });
    }
    return hydratePromise;
}

/**
 * 配置 GOOGLE_TRANSLATE_API_KEY 时使用 Google Cloud Translation 官方接口批量翻译
 */
async function translateWithOfficialApi(texts) {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!apiKey || texts.length === 0) {
        return new Map();
    }

    const translated = new Map();
    for (let index = 0; index < texts.length; index += OFFICIAL_BATCH_SIZE) {
        const batch = texts.slice(index, index + OFFICIAL_BATCH_SIZE);
        try {
            const response = await fetchWithTimeout(
                'https://translation.googleapis.com/language/translate/v2',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
                    body: JSON.stringify({ q: batch, target: 'zh-CN', format: 'text' }),
                },
                OFFICIAL_TIMEOUT_MS
            );
            if (!response.ok) {
                throw new Error(`状态码 ${response.status}`);
            }

            const payload = await response.json();
            payload?.data?.translations?.forEach((entry, position) => {
                if (entry?.translatedText) {
                    translated.set(batch[position], entry.translatedText);
                }
            });
        } catch (error) {
            console.warn('[Translation] 官方接口失败，回退备用通道:', error.message);
            break;
        }
    }

    return translated;
}

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

async function translateWithGoogleEndpoint(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetchWithTimeout(
        url,
        { headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'Mozilla/5.0' } },
        TRANSLATION_REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
        throw new Error(`Google 翻译接口返回状态码 ${response.status}`);
    }

    const payload = await response.json();
    return (
        payload?.[0]
            ?.map((segment) => segment?.[0] || '')
            .join('')
            .trim() || ''
    );
}

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
 * 翻译非中文标题：优先命中缓存，其次官方接口，最后使用免费通道
 */
export async function translateItems(items) {
    await hydrateTranslations();

    const queue = [];
    const sourcePositions = new Map();

    for (const item of items) {
        if (!item.titleOriginal) {
            continue;
        }

        const position = sourcePositions.get(item.source) || 0;
        sourcePositions.set(item.source, position + 1);

        if (containsCjk(item.titleOriginal)) {
            item.titleTranslated = item.titleOriginal;
        } else if (translationCache.has(item.titleOriginal)) {
            item.titleTranslated = translationCache.get(item.titleOriginal);
        } else {
            queue.push({ item, position });
        }
    }

    const ordered = queue.sort((a, b) => a.position - b.position).map(({ item }) => item);
    const initialCacheSize = translationCache.size;
    const official = await translateWithOfficialApi([
        ...new Set(ordered.map((item) => item.titleOriginal)),
    ]);

    const remaining = ordered.filter((item) => {
        const translated = official.get(item.titleOriginal);
        if (!translated) {
            return true;
        }
        setCachedTranslation(item.titleOriginal, translated);
        item.titleTranslated = translated;
        return false;
    });

    const deadline = Date.now() + TRANSLATION_BUDGET_MS;
    for (let index = 0; index < remaining.length; index += TRANSLATION_CONCURRENCY) {
        if (Date.now() >= deadline) {
            console.warn(`[Translation] 超出时间预算，剩余 ${remaining.length - index} 条保留原文`);
            break;
        }

        await Promise.allSettled(
            remaining.slice(index, index + TRANSLATION_CONCURRENCY).map(async (item) => {
                try {
                    const translated = await translateText(item.titleOriginal);
                    if (translated) {
                        setCachedTranslation(item.titleOriginal, translated);
                    }
                    item.titleTranslated = translated || item.titleOriginal;
                } catch (error) {
                    console.error('条目翻译失败:', item.id, error.message);
                    item.titleTranslated = item.titleOriginal;
                }
            })
        );
    }

    if (translationCache.size !== initialCacheSize) {
        await writeShared(
            SHARED_TRANSLATIONS_KEY,
            Object.fromEntries(translationCache),
            SHARED_TRANSLATIONS_TTL_SECONDS
        );
    }
}
