const DEFAULT_TIMEOUT_MS = 8000;

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

export function normalizeTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
}

export function containsCjk(text) {
    return /[\u3400-\u9fff]/.test(String(text || ''));
}

export function tokenizeTitle(title) {
    return normalizeTitle(title)
        .split(' ')
        .filter((token) => token.length >= 3);
}

export function isLikelyUsefulTitle(title) {
    const normalized = normalizeTitle(title);
    return normalized.length >= 8;
}

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

export function formatRelativeTime(timestamp) {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    return formatRelativeAge(diffSeconds);
}
