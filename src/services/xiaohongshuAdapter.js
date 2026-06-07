export const XiaohongshuAdapter = {
    async fetchHotTopics() {
        try {
            const apiKey = process.env.XIAOHONGSHU_API_KEY || '';

            if (!apiKey) {
                console.warn('[Xiaohongshu] API key not configured, using curated topics');
                return this.getCuratedHotTopics();
            }

            const url = `https://api.itapi.cn/api/hotnews/xiaohongshu?key=${apiKey}`;
            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            if (!response.ok) {
                console.warn(`[Xiaohongshu] API returned ${response.status}, using curated topics`);
                return this.getCuratedHotTopics();
            }

            const data = await response.json();
            if (data.code !== 200 || !data.data || data.data.length === 0) {
                console.warn('[Xiaohongshu] API returned invalid data, using curated topics');
                return this.getCuratedHotTopics();
            }

            return data.data.slice(0, 10).map((item, index) => ({
                id: `xiaohongshu-${Date.now()}-${index}`,
                source: 'Xiaohongshu',
                titleOriginal: item.name || '',
                titleTranslated: item.name || '',
                url: item.url || `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.name || '')}`,
                timestamp: new Date().toISOString(),
                views: item.viewnum || null,
                thumbnail: null,
            }));
        } catch (error) {
            console.error('[Xiaohongshu] Error:', error);
            return this.getCuratedHotTopics();
        }
    },

    getCuratedHotTopics() {
        const now = new Date().toISOString();
        const baseTime = Date.now();

        return [
            {
                id: `xiaohongshu-${baseTime}-0`,
                source: 'Xiaohongshu',
                titleOriginal: '春节出游攻略',
                titleTranslated: '春节出游攻略',
                url: 'https://www.xiaohongshu.com/search_result?keyword=%E6%98%A5%E8%8A%82%E5%87%BA%E6%B8%B8%E6%94%BB%E7%95%A5',
                timestamp: now,
                views: '128.5万',
                thumbnail: null,
            },
            {
                id: `xiaohongshu-${baseTime}-1`,
                source: 'Xiaohongshu',
                titleOriginal: '护肤品测评',
                titleTranslated: '护肤品测评',
                url: 'https://www.xiaohongshu.com/search_result?keyword=%E6%8A%A4%E8%82%A4%E5%93%81%E6%B5%8B%E8%AF%84',
                timestamp: now,
                views: '95.2万',
                thumbnail: null,
            },
            {
                id: `xiaohongshu-${baseTime}-2`,
                source: 'Xiaohongshu',
                titleOriginal: '健身打卡',
                titleTranslated: '健身打卡',
                url: 'https://www.xiaohongshu.com/search_result?keyword=%E5%81%A5%E8%BA%AB%E6%89%93%E5%8D%A1',
                timestamp: now,
                views: '76.8万',
                thumbnail: null,
            },
            {
                id: `xiaohongshu-${baseTime}-3`,
                source: 'Xiaohongshu',
                titleOriginal: '美食探店',
                titleTranslated: '美食探店',
                url: 'https://www.xiaohongshu.com/search_result?keyword=%E7%BE%8E%E9%A3%9F%E6%8E%A2%E5%BA%97',
                timestamp: now,
                views: '64.3万',
                thumbnail: null,
            },
            {
                id: `xiaohongshu-${baseTime}-4`,
                source: 'Xiaohongshu',
                titleOriginal: '穿搭灵感',
                titleTranslated: '穿搭灵感',
                url: 'https://www.xiaohongshu.com/search_result?keyword=%E7%A9%BF%E6%90%AD%E7%81%B5%E6%84%9F',
                timestamp: now,
                views: '52.7万',
                thumbnail: null,
            },
        ];
    },
};
