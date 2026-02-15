import { RSSAdapter } from './rssAdapter';
import { RedditAdapter } from './redditAdapter';
import { TwitterAdapter } from './twitterAdapter';
import { WeiboAdapter } from './weiboAdapter';
import { BilibiliAdapter } from './bilibiliAdapter';
import { ZhihuAdapter } from './zhihuAdapter';

export const NewsAggregator = {
    async fetchAllNews() {
        try {
            const [rssNews, redditNews, twitterNews, weiboNews, bilibiliNews, zhihuNews] = await Promise.allSettled([
                RSSAdapter.fetchAll(),
                RedditAdapter.fetchTrending(),
                TwitterAdapter.fetchTrending(),
                WeiboAdapter.fetchHotSearch(),
                BilibiliAdapter.fetchHotSearch(),
                ZhihuAdapter.fetchHotTopics()
            ]);

            let allNews = [];

            if (rssNews.status === 'fulfilled') allNews = allNews.concat(rssNews.value);
            if (redditNews.status === 'fulfilled') allNews = allNews.concat(redditNews.value);
            if (twitterNews.status === 'fulfilled') allNews = allNews.concat(twitterNews.value);
            if (weiboNews.status === 'fulfilled') allNews = allNews.concat(weiboNews.value);
            if (bilibiliNews.status === 'fulfilled') allNews = allNews.concat(bilibiliNews.value);
            if (zhihuNews.status === 'fulfilled') allNews = allNews.concat(zhihuNews.value);

            // Translation Step
            try {
                const { translate } = require('google-translate-api-x');
                // Batch translation might be too heavy or flagged, let's try individual for top items or mapped
                // Actually for better performance/reliability, let's just loop. 
                // Note: Free Google Translate API has limits. 

                // Parallelize translation with a limit to avoid rate limiting
                const newsToTranslate = allNews.slice(0, 50); // Translate top 50 only to save resources/time

                await Promise.allSettled(newsToTranslate.map(async (item) => {
                    if (!item.titleOriginal) return;
                    // 微博、B站和知乎内容已是中文,跳过翻译
                    if (item.source === 'Weibo' || item.source === 'Bilibili' || item.source === 'Zhihu') {
                        item.titleTranslated = item.titleOriginal;
                        return;
                    }
                    try {
                        const res = await translate(item.titleOriginal, { to: 'zh-CN' });
                        item.titleTranslated = res.text;
                    } catch (e) {
                        // keep original if translation fails
                        console.error('Translation failed for item:', item.id);
                    }
                }));

                allNews = newsToTranslate; // Only return translated ones to keep feed clean/relevant
            } catch (e) {
                console.error('Translation service error:', e);
            }

            // Sort by timestamp if available, otherwise randomize or keeping source order
            // Ideally mix them up a bit so it's not just blocks of same source

            allNews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return allNews;
        } catch (error) {
            console.error('NewsAggregator Error:', error);
            return [];
        }
    }
};
