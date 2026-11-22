import Parser from 'rss-parser';
import { generateStableId, isLikelyUsefulTitle } from './serviceUtils';

// 初始化 RSS 解析器（rss-parser 内置请求，通过 timeout 与 headers 选项配置）
const parser = new Parser({
    timeout: 8000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
});

// 全球及北美主流媒体 RSS 订阅源配置
const RSS_FEEDS = {
    'BBC News': 'http://feeds.bbci.co.uk/news/world/rss.xml',
    'New York Times': 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'The Guardian': 'https://www.theguardian.com/world/rss',
    'Al Jazeera': 'https://www.aljazeera.com/xml/rss/all.xml',
    CNN: 'https://news.google.com/rss/search?q=site:cnn.com&hl=en-US&gl=US&ceid=US:en',
    'CBS News': 'https://www.cbsnews.com/latest/rss/main',
    'CBC Toronto': 'https://www.cbc.ca/cmlink/rss-canada-toronto',
    'Global News': 'https://globalnews.ca/toronto/feed/',
    'Toronto Star': 'https://www.thestar.com/search/?f=rss&t=article&s=start_time&sd=desc&l=10',
    CP24: 'http://mybreakingnews.cp24.com/feed.xml',
};

export const RSSAdapter = {
    sourceNames: Object.keys(RSS_FEEDS),

    // 抓取单个 RSS 源的热门新闻
    async fetchTrending(sourceName) {
        const feedUrl = RSS_FEEDS[sourceName];
        if (!feedUrl) {
            console.error(`未找到对应的 RSS 源配置: ${sourceName}`);
            return [];
        }

        try {
            const feed = await parser.parseURL(feedUrl);
            return feed.items
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
        } catch (error) {
            console.error(`RSSAdapter 抓取失败 (${sourceName}):`, error.message);
            return [];
        }
    },

    // 并发抓取所有 RSS 源
    async fetchAll() {
        const results = await Promise.all(
            Object.keys(RSS_FEEDS).map((source) => this.fetchTrending(source))
        );
        return results.flat();
    },
};
