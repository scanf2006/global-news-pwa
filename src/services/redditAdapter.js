import { fetchWithTimeout, isLikelyUsefulTitle } from './serviceUtils';

const USER_AGENT = 'web:global-news-pwa:v1.0';
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

let cachedToken = null;

// 使用 Reddit 官方应用凭据获取访问令牌
async function getAccessToken() {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return null;
    }

    if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
        return cachedToken.value;
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetchWithTimeout(
        'https://www.reddit.com/api/v1/access_token',
        {
            method: 'POST',
            headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENT,
            },
            body: 'grant_type=client_credentials',
        },
        6000
    );

    if (!response.ok) {
        throw new Error(`Reddit 授权失败 ${response.status}`);
    }

    const data = await response.json();
    cachedToken = {
        value: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.value;
}

// Reddit 热门帖子适配器：配置凭据时走官方 OAuth，否则尝试公开接口
export const RedditAdapter = {
    async fetchTrending() {
        try {
            const token = await getAccessToken();
            const url = token
                ? 'https://oauth.reddit.com/r/popular?limit=20&raw_json=1'
                : 'https://www.reddit.com/r/popular.json?limit=20&raw_json=1';
            const response = await fetchWithTimeout(
                url,
                {
                    headers: {
                        'User-Agent': USER_AGENT,
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                },
                8000
            );

            if (!response.ok) {
                throw new Error(`Reddit 接口返回状态码 ${response.status}`);
            }

            const data = await response.json();

            return data.data.children
                .map((child) => child.data)
                .filter((item) => item?.permalink && !item.over_18 && isLikelyUsefulTitle(item.title))
                .map((item) => ({
                    id: `reddit-${item.id}`,
                    source: 'Reddit',
                    titleOriginal: item.title,
                    titleTranslated: null,
                    url: `https://www.reddit.com${item.permalink}`,
                    timestamp: new Date(item.created_utc * 1000).toISOString(),
                    views: item.score,
                    thumbnail: null,
                }));
        } catch (error) {
            console.error('RedditAdapter 抓取错误:', error.message);
            return [];
        }
    },
};
