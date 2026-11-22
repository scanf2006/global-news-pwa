import Parser from 'rss-parser';
import { generateStableId, isLikelyUsefulTitle } from './serviceUtils';

// 初始化 RSS 解析器（rss-parser 内置请求，通过 timeout 与 headers 选项配置）
const parser = new Parser({
    timeout: 6000,
    headers: {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
});

const googleNews = (query) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-CA&gl=CA&ceid=CA:en`;

// 每个来源按优先级配置一个或多个订阅地址
const RSS_FEEDS = {
    'BBC News': ['https://feeds.bbci.co.uk/news/world/rss.xml'],
    'New York Times': ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
    'The Guardian': ['https://www.theguardian.com/world/rss'],
    'Al Jazeera': ['https://www.aljazeera.com/xml/rss/all.xml'],
    CNN: [googleNews('site:cnn.com when:1d')],
    'CBS News': ['https://www.cbsnews.com/latest/rss/main'],
    'CBC Toronto': ['https://www.cbc.ca/cmlink/rss-canada-toronto'],
    'Global News': ['https://globalnews.ca/toronto/feed/'],
    'Toronto Star': [
        'https://www.thestar.com/search/?f=rss&t=article&s=start_time&sd=desc&l=10',
        googleNews('site:thestar.com toronto when:2d'),
    ],
    CP24: [googleNews('site:cp24.com when:2d')],
};

// Google News 标题末尾带“ - 媒体名”，去掉后才能与其他来源正确合并
export function stripPublisherSuffix(title, feedUrl) {
    const text = String(title || '').trim();
    return feedUrl.includes('news.google.com') ? text.replace(/\s+-\s+[^-]{2,60}$/, '') : text;
}

function getItemTime(item) {
    const time = new Date(item.isoDate || item.pubDate || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
}

export const RSSAdapter = {
    sourceNames: Object.keys(RSS_FEEDS),

    // 按优先级尝试来源的订阅地址，返回首个有效结果
    async fetchTrending(sourceName) {
        const feedUrls = RSS_FEEDS[sourceName];
        if (!feedUrls) {
            console.error(`未找到对应的 RSS 源配置: ${sourceName}`);
            return [];
        }

        for (const feedUrl of feedUrls) {
            try {
                const feed = await parser.parseURL(feedUrl);
                const items = [...feed.items]
                    .sort((a, b) => getItemTime(b) - getItemTime(a))
                    .map((item) => ({ ...item, title: stripPublisherSuffix(item.title, feedUrl) }))
                    .filter((item) => item.link && isLikelyUsefulTitle(item.title))
                    .slice(0, 20)
                    .map((item) => ({
                        id: generateStableId(`rss-${sourceName}`, item.link || item.title),
                        source: sourceName,
                        titleOriginal: item.title,
                        titleTranslated: null,
                        url: item.link,
                        timestamp: item.isoDate || item.pubDate || null,
                        views: null,
                        thumbnail: null,
                    }));

                if (items.length > 0) {
                    return items;
                }
            } catch (error) {
                console.warn(`RSSAdapter 抓取失败 (${sourceName}):`, error.message);
            }
        }

        return [];
    },
};
