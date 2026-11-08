const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 带超时控制的 fetch 请求封装
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
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
    // 提取非中文单词（长度 >= 3）
    const wordMatches = normalized.match(/[a-z0-9]{3,}/g);
    if (wordMatches) {
        tokens.push(...wordMatches);
    }

    // 提取中文字符片段并生成二元组（Bigrams）
    const cjkSegments = normalized.match(/[\u3400-\u9fff]+/g);
    if (cjkSegments) {
        for (const segment of cjkSegments) {
            if (segment.length <= 2) {
                tokens.push(segment);
            } else {
                for (let i = 0; i < segment.length - 1; i += 1) {
                    tokens.push(segment.slice(i, i + 2));
                }
            }
        }
    }

    return tokens;
}

/**
 * 判断标题是否为有效新闻标题（针对中文短标题放宽长度阈值）
 */
export function isLikelyUsefulTitle(title) {
    const normalized = normalizeTitle(title);
    if (!normalized) {
        return false;
    }

    if (containsCjk(normalized)) {
        return normalized.length >= 2;
    }

    return normalized.length >= 8;
}

/**
 * 计算两个标题之间的 Token 重叠相似度
 */
export function calculateTokenSimilarity(titleA, titleB) {
    const tokensA = new Set(tokenizeTitle(titleA));
    const tokensB = new Set(tokenizeTitle(titleB));

    if (tokensA.size === 0 || tokensB.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const token of tokensA) {
        if (tokensB.has(token)) {
            overlap += 1;
        }
    }

    return overlap / Math.max(tokensA.size, tokensB.size);
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
    return `${hours}h`;
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
