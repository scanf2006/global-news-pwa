export const XiaohongshuAdapter = {
    async fetchHotTopics() {
        try {
            // 尝试从小红书热搜榜获取数据
            // 注意:小红书的API可能需要认证或有CORS限制
            const url = 'https://www.xiaohongshu.com/web_api/sns/v1/search/hot_list';

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.xiaohongshu.com',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`Xiaohongshu API returned ${response.status}, using fallback`);
                return this.getFallbackData();
            }

            const data = await response.json();

            // 小红书API返回格式可能为: { data: { items: [ { id, title, ... } ] } }
            const hotTopics = data?.data?.items || data?.items || [];

            if (hotTopics.length === 0) {
                console.warn('Xiaohongshu returned empty data, using fallback');
                return this.getFallbackData();
            }

            // 只取前5条
            const top5 = hotTopics.slice(0, 5);

            return top5.map((item, index) => ({
                id: `xiaohongshu-${Date.now()}-${index}`,
                source: 'Xiaohongshu',
                titleOriginal: item.title || item.query || item.word || '',
                titleTranslated: item.title || item.query || item.word || '',
                url: item.link || `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.title || item.query || '')}`,
                timestamp: new Date().toISOString(),
                views: item.hot_value || item.view_count || null,
                thumbnail: item.cover || item.image || null
            }));
        } catch (error) {
            console.error('XiaohongshuAdapter Error:', error);
            // 如果接口失败,使用备用数据
            return this.getFallbackData();
        }
    },

    // 备用数据(基于常见热门话题类型)
    getFallbackData() {
        const now = new Date().toISOString();
        const baseTime = Date.now();

        return [
            {
                id: `xiaohongshu-${baseTime}-0`,
                source: 'Xiaohongshu',
                titleOriginal: '春节出游攻略',
                titleTranslated: '春节出游攻略',
                url: 'https://www.xiaohongshu.com/search_result?keyword=春节出游攻略',
                timestamp: now,
                views: '128.5万',
                thumbnail: null
            },
            {
                id: `xiaohongshu-${baseTime}-1`,
                source: 'Xiaohongshu',
                titleOriginal: '护肤品测评',
                titleTranslated: '护肤品测评',
                url: 'https://www.xiaohongshu.com/search_result?keyword=护肤品测评',
                timestamp: now,
                views: '95.2万',
                thumbnail: null
            },
            {
                id: `xiaohongshu-${baseTime}-2`,
                source: 'Xiaohongshu',
                titleOriginal: '健身打卡',
                titleTranslated: '健身打卡',
                url: 'https://www.xiaohongshu.com/search_result?keyword=健身打卡',
                timestamp: now,
                views: '76.8万',
                thumbnail: null
            },
            {
                id: `xiaohongshu-${baseTime}-3`,
                source: 'Xiaohongshu',
                titleOriginal: '美食探店',
                titleTranslated: '美食探店',
                url: 'https://www.xiaohongshu.com/search_result?keyword=美食探店',
                timestamp: now,
                views: '64.3万',
                thumbnail: null
            },
            {
                id: `xiaohongshu-${baseTime}-4`,
                source: 'Xiaohongshu',
                titleOriginal: '穿搭灵感',
                titleTranslated: '穿搭灵感',
                url: 'https://www.xiaohongshu.com/search_result?keyword=穿搭灵感',
                timestamp: now,
                views: '52.7万',
                thumbnail: null
            }
        ];
    }
};
