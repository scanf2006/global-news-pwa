import { ServerCache } from '../lib/serverCache.js';
import { fetchWithTimeout } from '../services/serviceUtils.js';

const WEIBO_COOKIE_CACHE_KEY = 'weibo_guest_sub_cookie';
const WEIBO_COOKIE_TTL_SECONDS = 3600; // 缓存 1 小时

/**
 * 自动获取微博访客 Cookie (SUB)
 * 模拟新浪访客系统流程: genvisitor -> incarnate -> SUB
 */
export async function getWeiboGuestCookie() {
    // 优先复用服务端内存缓存中的访客 Cookie
    const cachedCookie = ServerCache.get(WEIBO_COOKIE_CACHE_KEY);
    if (cachedCookie) {
        return cachedCookie;
    }

    try {
        // 1. 构造浏览器指纹 (Fingerprint)
        const fp = {
            os: '1',
            browser: 'Chrome70',
            fonts: 'undefined',
            screenInfo: '1920*1080*24',
            plugins: '',
        };

        // 2. 第一步: genvisitor (获取 TID)
        const genUrl = 'https://passport.weibo.com/visitor/genvisitor';
        const formData = new URLSearchParams();
        formData.append('cb', 'gen_callback');
        formData.append('fp', JSON.stringify(fp));

        const genRes = await fetchWithTimeout(
            genUrl,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                body: formData,
            },
            6000
        );

        if (!genRes.ok) {
            throw new Error(`GenVisitor 请求失败: ${genRes.status}`);
        }

        const genText = await genRes.text();
        // 解析 JSONP: window.gen_callback && gen_callback({...});
        const jsonpMatch = genText.match(/gen_callback\((.*)\)/);
        if (!jsonpMatch) {
            throw new Error('解析 gen_callback 响应失败');
        }

        const genData = JSON.parse(jsonpMatch[1]);
        if (genData.retcode !== 20000000) {
            throw new Error(`GenVisitor 逻辑返回异常: ${JSON.stringify(genData)}`);
        }

        const tid = genData.data?.tid;
        const confidence = genData.data?.confidence || 100;

        if (!tid) {
            throw new Error('GenVisitor 响应中未找到 TID');
        }

        // 3. 第二步: incarnate (使用 TID 换取 SUB Cookie)
        const incarnateUrl = `https://passport.weibo.com/visitor/visitor?a=incarnate&t=${encodeURIComponent(tid)}&w=${genData.data.where || 2}&c=${confidence}&gc=&cb=cross_domain&from=weibo&_rand=${Math.random()}`;

        const incRes = await fetchWithTimeout(
            incarnateUrl,
            {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    Referer: 'https://passport.weibo.com/visitor/visitor',
                },
            },
            6000
        );

        if (!incRes.ok) {
            throw new Error(`Incarnate 请求失败: ${incRes.status}`);
        }

        const incText = await incRes.text();
        // 解析 JSONP: window.cross_domain && cross_domain({...});
        const incMatch = incText.match(/cross_domain\((.*)\)/);
        if (!incMatch) {
            throw new Error('解析 cross_domain 响应失败');
        }

        const incData = JSON.parse(incMatch[1]);
        if (incData.retcode !== 20000000) {
            throw new Error(`Incarnate 逻辑返回异常: ${JSON.stringify(incData)}`);
        }

        const sub = incData.data?.sub;

        if (sub) {
            ServerCache.set(WEIBO_COOKIE_CACHE_KEY, sub, WEIBO_COOKIE_TTL_SECONDS);
            return sub;
        }

        throw new Error('Incarnate 响应中未找到 SUB Cookie');
    } catch (error) {
        console.error('[WeiboCookie] 生成访客 Cookie 失败:', error.message);
        return null; // 返回 null 表示失败，调用方应处理降级逻辑
    }
}
