import * as Sentry from '@sentry/nextjs';
import { fetchWithTimeout, isLikelyUsefulTitle } from './serviceUtils';

// YouTube 热门视频适配器
export const YouTubeAdapter = {
    async fetchTrending() {
        try {
            const apiKey = process.env.YOUTUBE_API_KEY || '';

            if (!apiKey) {
                return [];
            }

            const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=US&maxResults=20';
            const response = await fetchWithTimeout(
                url,
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Goog-Api-Key': apiKey,
                    },
                },
                8000
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[YouTube] 接口返回错误 (${response.status}):`, errorText);

                Sentry.captureException(new Error(`YouTube API error: ${response.status}`), {
                    tags: {
                        adapter: 'YouTube',
                        action: 'fetchTrending',
                        status: response.status,
                    },
                    extra: {
                        errorText: errorText.substring(0, 500),
                        apiKeyPresent: !!apiKey,
                    },
                });

                return [];
            }

            const data = await response.json();
            if (!data.items?.length) {
                console.error('[YouTube] 未返回任何视频条目');
                return [];
            }

            return data.items
                .filter((item) => isLikelyUsefulTitle(item.snippet?.title))
                .map((item) => ({
                    id: `youtube-${item.id}`,
                    source: 'YouTube',
                    titleOriginal: item.snippet.title,
                    titleTranslated: null,
                    url: `https://www.youtube.com/watch?v=${item.id}`,
                    timestamp: item.snippet.publishedAt || new Date().toISOString(),
                    views: this.formatViews(item.statistics?.viewCount),
                    thumbnail: null,
                }));
        } catch (error) {
            console.error('[YouTube] 请求异常:', error.message);

            Sentry.captureException(error, {
                tags: {
                    adapter: 'YouTube',
                    action: 'fetchTrending',
                },
                extra: {
                    errorMessage: error.message,
                },
            });

            return [];
        }
    },

    // 将播放量数值格式化为 K / M 简写
    formatViews(viewCount) {
        if (!viewCount) return '0';
        const count = parseInt(viewCount, 10);
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(1)}M`;
        }
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    },
};
