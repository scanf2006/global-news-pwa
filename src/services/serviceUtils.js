const DEFAULT_TIMEOUT_MS = 8000;
const MIN_FUZZY_MATCH_TOKENS = 3;
const MIN_ORDER_AGREEMENT = 0.6;

export const TWITTER_SOURCE = 'X (Twitter)';

/**
 * 带超时控制的 fetch 请求封装
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });

        // 在超时窗口内读完响应体，避免响应头返回后请求仍然无限挂起
        const hasNoBody = [101, 204, 205, 304].includes(response.status);
        const body = hasNoBody ? null : await response.arrayBuffer();

        return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 规范化标题文本：转小写、合并空白字符并移除标点符号
 */
export function normalizeTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
}

/**
 * 检测文本是否包含中日韩（CJK）统一表意文字
 */
export function containsCjk(text) {
    return /[\u3400-\u9fff]/.test(String(text || ''));
}

/**
 * 根据固定前缀与内容生成确定性的稳定 ID（基于 FNV-1a 哈希），避免刷新后 ID 变化
 */
export function generateStableId(prefix, content) {
    const raw = String(content || '').trim();
    let hash = 0x811c9dc5;

    for (let i = 0; i < raw.length; i += 1) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    const safePrefix = String(prefix || 'news')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    return `${safePrefix}-${(hash >>> 0).toString(36)}`;
}

/**
 * 对标题进行分词：英文按单词切分，中文提取字符二元组（Bigrams）以支持相似度计算
 */
export function tokenizeTitle(title) {
    const normalized = normalizeTitle(title);
    if (!normalized) {
        return [];
    }

    const tokens = [];
    // 按原文顺序提取英文单词（长度 >= 3）、完整数字和中文片段
    const segments = normalized.match(/[a-z]{3,}|\d+|[\u3400-\u9fff]+/g) || [];

    for (const segment of segments) {
        if (!containsCjk(segment) || segment.length <= 2) {
            tokens.push(segment);
            continue;
        }

        // 中文片段生成二元组（Bigrams）
        for (let i = 0; i < segment.length - 1; i += 1) {
            tokens.push(segment.slice(i, i + 2));
        }
    }

    return tokens;
}

/**
 * 判断标题是否为有效新闻标题（中文和 X 趋势词通常较短，使用更低阈值）
 */
export function isLikelyUsefulTitle(title, source) {
    const normalized = normalizeTitle(title);
    if (!normalized) {
        return false;
    }

    if (containsCjk(normalized) || source === TWITTER_SOURCE) {
        return normalized.length >= 2;
    }

    return normalized.length >= 8;
}

/**
 * 计算共同 Token 在两个标题中保持相同先后顺序的比例
 */
function calculateOrderAgreement(tokensA, tokensB, sharedTokens) {
    if (sharedTokens.length < 2) {
        return 1;
    }

    let samePairs = 0;
    let totalPairs = 0;

    for (let i = 0; i < sharedTokens.length; i += 1) {
        for (let j = i + 1; j < sharedTokens.length; j += 1) {
            const orderA = tokensA.indexOf(sharedTokens[i]) - tokensA.indexOf(sharedTokens[j]);
            const orderB = tokensB.indexOf(sharedTokens[i]) - tokensB.indexOf(sharedTokens[j]);
            totalPairs += 1;
            if (Math.sign(orderA) === Math.sign(orderB)) {
                samePairs += 1;
            }
        }
    }

    return samePairs / totalPairs;
}

/**
 * 计算两个标题之间的相似度。
 * 数字不同、词序明显相反或 Token 过少时视为不同事件，宁可少合并也不误合并。
 */
export function calculateTokenSimilarity(titleA, titleB) {
    const orderedA = tokenizeTitle(titleA);
    const orderedB = tokenizeTitle(titleB);
    const tokensA = new Set(orderedA);
    const tokensB = new Set(orderedB);

    if (Math.min(tokensA.size, tokensB.size) < MIN_FUZZY_MATCH_TOKENS) {
        return 0;
    }

    const numbersA = [...tokensA].filter((token) => /^\d+$/.test(token));
    const numbersB = [...tokensB].filter((token) => /^\d+$/.test(token));
    if (
        numbersA.length > 0 &&
        numbersB.length > 0 &&
        (numbersA.length !== numbersB.length || numbersA.some((token) => !tokensB.has(token)))
    ) {
        return 0;
    }

    const sharedTokens = [...tokensA].filter((token) => tokensB.has(token));
    if (calculateOrderAgreement(orderedA, orderedB, sharedTokens) < MIN_ORDER_AGREEMENT) {
        return 0;
    }

    return sharedTokens.length / Math.max(tokensA.size, tokensB.size);
}

/**
 * 校验链接协议，只保留 http 和 https
 */
export function sanitizeHttpUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

/**
 * 新闻排序：有发布时间的按时间倒序，热榜条目排在后面并保持原有名次
 */
export function compareNewsItems(a, b) {
    const aPublished = a.hasPublishedTime !== false;
    const bPublished = b.hasPublishedTime !== false;

    if (aPublished !== bPublished) {
        return aPublished ? -1 : 1;
    }

    return aPublished ? new Date(b.timestamp) - new Date(a.timestamp) : 0;
}

/**
 * 将秒数格式化为简短的相对时长字符串
 */
export function formatRelativeAge(seconds) {
    if (seconds == null) {
        return '';
    }

    if (seconds < 60) {
        return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }

    return `${Math.floor(hours / 24)}d`;
}

/**
 * 将时间戳格式化为距今的相对时长
 */
export function formatRelativeTime(timestamp) {
    const timeMs = new Date(timestamp).getTime();
    if (Number.isNaN(timeMs)) {
        return '';
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
    return formatRelativeAge(diffSeconds);
}
