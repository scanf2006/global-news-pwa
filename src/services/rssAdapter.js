import Parser from 'rss-parser';
import { fetchWithTimeout, generateStableId, isLikelyUsefulTitle } from './serviceUtils';

const parser = new Parser();
const FEED_TIMEOUT_MS = 6000;
const FEED_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
};
const GOOGLE_NEWS_GAP_MS = 350;
const GOOGLE_NEWS_RETRY_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let googleNewsQueue = Promise.resolve();

// 多个来源共用 Google News，错开请求以降低 429 概率
function waitForGoogleNewsTurn() {
    const turn = googleNewsQueue.then(() => sleep(GOOGLE_NEWS_GAP_MS));
    googleNewsQueue = turn;
    return turn;
}

export async function fetchFeed(feedUrl) {
    const isGoogleNews = feedUrl.includes('news.google.com');

    for (let attempt = 0; ; attempt += 1) {
        if (isGoogleNews) {
            await waitForGoogleNewsTurn();
        }

        const response = await fetchWithTimeout(feedUrl, { headers: FEED_HEADERS }, FEED_TIMEOUT_MS);
        if (response.status === 429 && isGoogleNews && attempt === 0) {
            await sleep(GOOGLE_NEWS_RETRY_MS);
            continue;
        }
        if (!response.ok) {
            throw new Error(`状态码 ${response.status}`);
        }

        return parser.parseString(await response.text());
    }
}

const googleNews = (query) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-CA&gl=CA&ceid=CA:en`;

// 每个来源按优先级配置一个或多个订阅地址
const RSS_FEEDS = {
    'BBC News': ['https://feeds.bbci.co.uk/news/world/rss.xml'],
    'New York Times': ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
    'The Guardian': ['https://www.theguardian.com/world/rss'],
    'Al Jazeera': ['https://www.aljazeera.com/xml/rss/all.xml'],
    DW: ['https://rss.dw.com/rdf/rss-en-world'],
    'France 24': ['https://www.france24.com/en/rss'],
    CNA: ['https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml'],
    SCMP: ['https://www.scmp.com/rss/91/feed'],
    'BBC 中文': ['https://feeds.bbci.co.uk/zhongwen/simp/rss.xml'],
    'DW 中文': ['https://rss.dw.com/rdf/rss-chi-all'],
    'RFI 中文': ['https://www.rfi.fr/cn/rss'],
    CNN: [googleNews('site:cnn.com when:1d')],
    'CBS News': ['https://www.cbsnews.com/latest/rss/main'],
    'CBC Toronto': ['https://www.cbc.ca/cmlink/rss-canada-toronto'],
    'Global News': ['https://globalnews.ca/toronto/feed/'],
    'CityNews Toronto': ['https://toronto.citynews.ca/feed/'],
    'Globe and Mail': ['https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/'],
    // 官方 RSS 常返回 429，优先使用 Google News
    'Toronto Star': [
        googleNews('site:thestar.com toronto when:2d'),
        'https://www.thestar.com/search/?f=rss&t=article&s=start_time&sd=desc&l=10',
    ],
    CP24: [googleNews('site:cp24.com when:2d')],
    'IT之家': ['https://www.ithome.com/rss/'],
    CNBC: ['https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362'],
    'The Verge': ['https://www.theverge.com/rss/index.xml'],
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
                const feed = await fetchFeed(feedUrl);
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
