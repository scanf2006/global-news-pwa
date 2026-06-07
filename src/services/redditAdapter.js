import { fetchWithTimeout, isLikelyUsefulTitle } from './serviceUtils';

export const RedditAdapter = {
    async fetchTrending() {
        try {
            const response = await fetchWithTimeout('https://www.reddit.com/r/popular.json?limit=20', {
                headers: {
                    'User-Agent': 'global-news-pwa/1.0',
                    Accept: 'application/json',
                },
                next: { revalidate: 300 },
            }, 8000);

            if (!response.ok) {
                throw new Error(`Reddit returned ${response.status}`);
            }

            const data = await response.json();

            return data.data.children
                .map((child) => child.data)
                .filter((item) => item?.permalink && isLikelyUsefulTitle(item.title))
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
            console.error('RedditAdapter Error:', error);
            return [];
        }
    },
};
