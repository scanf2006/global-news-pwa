import { fetchWithTimeout, isLikelyUsefulTitle } from './serviceUtils';

const API_BASE = 'https://hacker-news.firebaseio.com/v0';
const STORY_COUNT = 20;
const REQUEST_TIMEOUT_MS = 5000;

async function fetchJson(path) {
    const response = await fetchWithTimeout(`${API_BASE}/${path}`, {}, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
        throw new Error(`Hacker News 接口返回状态码 ${response.status}`);
    }
    return response.json();
}

// Hacker News 官方接口：取首页热门故事
export const HackerNewsAdapter = {
    async fetchTrending() {
        try {
            const ids = await fetchJson('topstories.json');
            const results = await Promise.allSettled(
                ids.slice(0, STORY_COUNT).map((id) => fetchJson(`item/${id}.json`))
            );

            return results
                .flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []))
                .filter(
                    (story) =>
                        story.type === 'story' &&
                        !story.dead &&
                        !story.deleted &&
                        isLikelyUsefulTitle(story.title)
                )
                .map((story, index) => ({
                    id: `hn-${story.id}`,
                    source: 'Hacker News',
                    titleOriginal: story.title,
                    titleTranslated: null,
                    url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
                    timestamp: new Date(story.time * 1000).toISOString(),
                    views: story.score,
                    rank: index + 1,
                    thumbnail: null,
                }));
        } catch (error) {
            console.error('HackerNewsAdapter 抓取错误:', error.message);
            return [];
        }
    },
};
