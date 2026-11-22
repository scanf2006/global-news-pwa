import * as cheerio from 'cheerio';
import {
    TWITTER_SOURCE,
    fetchWithTimeout,
    generateStableId,
    isLikelyUsefulTitle,
} from './serviceUtils';

const MAX_TRENDS = 20;

// X (Twitter) 趋势数据源列表（按优先级排列）
const SOURCES = [
    'https://getdaytrends.com/united-states/',
    'https://getdaytrends.com/',
    'https://us.trend-calendar.com/',
];

const REQUEST_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

export const TwitterAdapter = {
    async fetchTrending() {
        try {
            for (const url of SOURCES) {
                try {
                    const response = await fetchWithTimeout(url, { headers: REQUEST_HEADERS }, 8000);

                    if (!response.ok) {
                        console.warn(`[TwitterAdapter] 请求失败 ${url}: ${response.status}`);
                        continue;
                    }

                    const html = await response.text();
                    const $ = cheerio.load(html);
                    const trends = [];

                    if (url.includes('getdaytrends.com')) {
                        $('table tbody tr').each((index, element) => {
                            if (trends.length >= MAX_TRENDS) {
                                return false;
                            }

                            const link = $(element).find('a').first();
                            const title = link.text().trim();
                            const countText = $(element).find('.small.text-muted').text().trim();

                            if (isLikelyUsefulTitle(title, TWITTER_SOURCE)) {
                                trends.push({
                                    id: generateStableId('twitter', title),
                                    source: TWITTER_SOURCE,
                                    titleOriginal: title,
                                    titleTranslated: null,
                                    url: `https://twitter.com/search?q=${encodeURIComponent(title)}`,
                                    timestamp: new Date().toISOString(),
                                    views: countText || 'Trending',
                                    thumbnail: null,
                                });
                            }
                        });
                    } else {
                        $('.cw-list-item').each((index, element) => {
                            if (trends.length >= MAX_TRENDS) {
                                return false;
                            }

                            const title = $(element).find('.cw-list-name').text().trim();
                            if (isLikelyUsefulTitle(title, TWITTER_SOURCE)) {
                                trends.push({
                                    id: generateStableId('twitter', title),
                                    source: TWITTER_SOURCE,
                                    titleOriginal: title,
                                    titleTranslated: null,
                                    url: `https://twitter.com/search?q=${encodeURIComponent(title)}`,
                                    timestamp: new Date().toISOString(),
                                    views: 'Trending',
                                    thumbnail: null,
                                });
                            }
                        });
                    }

                    if (trends.length > 0) {
                        return trends;
                    }
                } catch (error) {
                    console.error(`[TwitterAdapter] 解析源 ${url} 出错:`, error.message);
                }
            }

            return [];
        } catch (error) {
            console.error('[TwitterAdapter] 严重错误:', error.message);
            return [];
        }
    },
};
