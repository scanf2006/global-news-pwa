// 诊断API端点 - 检查小红书数据获取状态
import { XiaohongshuAdapter } from '@/services/xiaohongshuAdapter';

export async function GET(request) {
    try {
        const apiKey = process.env.XIAOHONGSHU_API_KEY;

        // 安全地显示密钥状态
        const keyStatus = apiKey
            ? `配置成功 (${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)})`
            : '未配置';

        // 测试获取数据
        const data = await XiaohongshuAdapter.fetchHotTopics();

        return Response.json({
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'unknown',
            apiKeyStatus: keyStatus,
            apiKeyConfigured: !!apiKey,
            dataFetched: data.length > 0,
            itemCount: data.length,
            sampleData: data.slice(0, 2).map(item => ({
                title: item.titleOriginal,
                views: item.views,
                source: item.source
            })),
            message: data.length > 0
                ? '✅ 小红书数据获取成功!'
                : '❌ 未获取到数据,请检查环境变量配置'
        });
    } catch (error) {
        return Response.json({
            error: error.message,
            message: '❌ 诊断失败'
        }, { status: 500 });
    }
}
