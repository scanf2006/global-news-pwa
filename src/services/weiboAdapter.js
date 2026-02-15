import * as cheerio from 'cheerio';

export const WeiboAdapter = {
    async fetchHotSearch() {
        try {
            // 尝试从微博官方接口获取热搜数据
            const url = 'https://weibo.com/ajax/side/hotSearch';

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://weibo.com'
                }
            });

            if (!response.ok) {
                throw new Error(`Weibo API returned ${response.status}`);
            }

            const data = await response.json();

            // 微博API返回格式: { data: { realtime: [ { word, num, ... } ] } }
            const hotSearchList = data?.data?.realtime || [];

            // 只取前5条
            const top5 = hotSearchList.slice(0, 5);

            return top5.map((item, index) => ({
                id: `weibo-${Date.now()}-${index}`,
                source: 'Weibo',
                titleOriginal: item.word || item.word_scheme || '',
                titleTranslated: item.word || item.word_scheme || '', // 微博已是中文
                url: `https://s.weibo.com/weibo?q=${encodeURIComponent('#' + (item.word || item.word_scheme) + '#')}`,
                timestamp: new Date().toISOString(),
                views: item.num ? String(item.num) : null,
                thumbnail: item.pic || null
            }));
        } catch (error) {
            console.error('WeiboAdapter Error:', error);
            // 如果官方接口失败,返回空数组而不是抛出错误
            return [];
        }
    }
};
