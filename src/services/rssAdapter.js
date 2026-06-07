import Parser from 'rss-parser';
import { fetchWithTimeout, isLikelyUsefulTitle } from './serviceUtils';

const parser = new Parser({
    customFetch: (url) => fetchWithTimeout(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        },
    }, 8000),
});

const RSS_FEEDS = {
    'BBC News': 'http://feeds.bbci.co.uk/news/world/rss.xml',
    'New York Times': 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'The Guardian': 'https://www.theguardian.com/world/rss',
    'Al Jazeera': 'https://www.aljazeera.com/xml/rss/all.xml',
    'CNN': 'https://news.google.com/rss/search?q=site:cnn.com&hl=en-US&gl=US&ceid=US:en',
    'CBS News': 'https://www.cbsnews.com/latest/rss/main',
    'CBC Toronto': 'https://www.cbc.ca/cmlink/rss-canada-toronto',
    'Global News': 'https://globalnews.ca/toronto/feed/',
    'Toronto Star': 'https://www.thestar.com/search/?f=rss&t=article&s=start_time&sd=desc&l=10',
    'CP24': 'http://mybreakingnews.cp24.com/feed.xml',
};

export const RSSAdapter = {
    async fetchTrending(sourceName) {
        const feedUrl = RSS_FEEDS[sourceName];
        if (!feedUrl) {
            console.error(`RSS Feed not found for source: ${sourceName}`);
            return [];
        }

        try {
            const feed = await parser.parseURL(feedUrl);
            return feed.items
                .filter((item) => item.link && isLikelyUsefulTitle(item.title))
                .slice(0, 20)
                .map((item, index) => ({
                    id: `rss-${sourceName}-${index}-${Date.now()}`,
                    source: sourceName,
                    titleOriginal: item.title,
                    titleTranslated: null,
                    url: item.link,
                    timestamp: item.pubDate || item.isoDate || new Date().toISOString(),
                    views: null,
                    thumbnail: null,
                }));
        } catch (error) {
            console.error(`RSSAdapter Error (${sourceName}):`, error);
            return [];
        }
    },

    async fetchAll() {
        const results = await Promise.all(Object.keys(RSS_FEEDS).map((source) => this.fetchTrending(source)));
        return results.flat();
    },
};
