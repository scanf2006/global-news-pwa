import { getWeiboGuestCookie } from '../utils/weiboCookieGenerator.js';
import { fetchWithTimeout, generateStableId } from './serviceUtils.js';

// 微博热搜适配器（多源容灾 + 自动访客 Cookie）
export const WeiboAdapter = {
    async fetchHotSearch() {
        try {
            // 定义所有可用的数据源，按优先级排序
            const sources = [
                {
                    // 0. 微博官方侧边栏热搜接口（配合自动生成的访客 Cookie）
                    name: 'weibo-direct',
                    url: 'https://weibo.com/ajax/side/hotSearch',
                    parser: (data) => {
                        if (data?.data?.realtime) {
                            return data.data.realtime.slice(0, 30).map((item, index) => {
                                const topicTitle = item.note || item.word;
                                return {
                                    id: generateStableId('weibo', topicTitle),
                                    title: topicTitle,
                                    url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word_scheme || item.word)}`,
                                    source: '微博热搜',
                                    rank: index + 1,
                                    views: item.num,
                                    titleOriginal: topicTitle,
                                    timestamp: new Date().toISOString(),
                                };
                            });
                        }
                        return null;
                    },
                    needsCookie: true,
                },
                {
                    // 1. GitHub Raw (Master 分支)
                    name: 'github-raw-master',
                    url: 'https://raw.githubusercontent.com/justjavac/weibo-trending-hot-search/master/hot-search.json',
                    parser: (data) => parseGithubData(data),
                },
                {
                    // 2. jsDelivr CDN
                    name: 'jsdelivr',
                    url: 'https://cdn.jsdelivr.net/gh/justjavac/weibo-trending-hot-search@master/hot-search.json',
                    parser: (data) => parseGithubData(data),
                },
                {
                    // 3. Fastly jsDelivr 备用 CDN
                    name: 'jsdelivr-fastly',
                    url: 'https://fastly.jsdelivr.net/gh/justjavac/weibo-trending-hot-search@master/hot-search.json',
                    parser: (data) => parseGithubData(data),
                },
                {
                    // 4. Tenapi 热搜接口
                    name: 'tenapi',
                    url: 'https://tenapi.cn/v2/weibohot',
                    parser: (data) => {
                        if (data?.code === 200 && Array.isArray(data.data)) {
                            return data.data.slice(0, 30).map((item, index) => ({
                                id: generateStableId('weibo', item.name),
                                title: item.name,
                                url: item.url,
                                source: '微博热搜',
                                rank: index + 1,
                                views: parseViews(item.hot),
                                titleOriginal: item.name,
                                timestamp: new Date().toISOString(),
                            }));
                        }
                        return null;
                    },
                },
                {
                    // 5. VVhan 热榜接口
                    name: 'vvhan',
                    url: 'https://api.vvhan.com/api/hotlist/weiboHot',
                    parser: (data) => {
                        if (data?.success && Array.isArray(data.data)) {
                            return data.data.slice(0, 30).map((item, index) => ({
                                id: generateStableId('weibo', item.title),
                                title: item.title,
                                url: item.url,
                                source: '微博热搜',
                                rank: index + 1,
                                views: parseViews(item.hot),
                                titleOriginal: item.title,
                                timestamp: new Date().toISOString(),
                            }));
                        }
                        return null;
                    },
                },
                {
                    // 6. OIOWeb 热榜接口
                    name: 'oioweb',
                    url: 'https://api.oioweb.cn/api/common/HotList?type=weibo',
                    parser: (data) => {
                        if (data?.code === 200 && Array.isArray(data.result?.list)) {
                            return data.result.list.slice(0, 30).map((item, index) => ({
                                id: generateStableId('weibo', item.title),
                                title: item.title,
                                url: item.url,
                                source: '微博热搜',
                                rank: index + 1,
                                views: parseViews(item.hot),
                                titleOriginal: item.title,
                                timestamp: new Date().toISOString(),
                            }));
                        }
                        return null;
                    },
                },
            ];

            // 按优先级依次尝试每个数据源
            for (const source of sources) {
                try {
                    const headers = {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        Accept: 'application/json, text/plain, */*',
                        'Cache-Control': 'no-cache',
                        Referer: 'https://weibo.com/',
                        'X-Requested-With': 'XMLHttpRequest',
                    };

                    // 处理需要访客 Cookie 的数据源
                    if (source.needsCookie) {
                        const subCookie = await getWeiboGuestCookie();
                        if (subCookie) {
                            headers.Cookie = `SUB=${subCookie}`;
                        } else {
                            continue;
                        }
                    }

                    const response = await fetchWithTimeout(source.url, { headers }, 8000);

                    if (response.ok) {
                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('text/html')) {
                            console.warn(`[WeiboAdapter] 数据源 ${source.name} 返回了 HTML 页面，跳过`);
                            continue;
                        }

                        const data = await response.json();
                        const parsed = source.parser(data);

                        if (parsed && parsed.length > 0) {
                            return parsed;
                        }
                    } else {
                        console.warn(`[WeiboAdapter] 数据源 ${source.name} 返回状态码: ${response.status}`);
                    }
                } catch (error) {
                    const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';
                    console.warn(
                        `[WeiboAdapter] 数据源 ${source.name} 请求失败: ${isTimeout ? '请求超时' : error.message}`
                    );
                }
            }
        } catch (error) {
            console.error('[WeiboAdapter] 循环抓取异常:', error);
        }

        // 所有源均不可用时返回空列表，由聚合层标记该来源暂不可用
        return [];
    },
};

// 解析 GitHub 热搜 JSON 数据格式
function parseGithubData(data) {
    if (Array.isArray(data)) {
        return data.slice(0, 30).map((item, index) => {
            const topicTitle = item.title || item.word;
            return {
                id: generateStableId('weibo', topicTitle),
                title: topicTitle,
                url: item.url || `https://s.weibo.com/weibo?q=${encodeURIComponent(topicTitle)}`,
                source: '微博热搜',
                rank: index + 1,
                views: item.hot || item.num || 0,
                titleOriginal: topicTitle,
                timestamp: new Date().toISOString(),
            };
        });
    }
    return null;
}

// 解析热度数值
function parseViews(hot) {
    if (!hot) return 0;
    if (typeof hot === 'number') return hot;
    return parseInt(hot, 10) || 0;
}
