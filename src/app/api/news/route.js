import { NextResponse } from 'next/server';
import { NewsAggregator } from '@/services/newsAggregator';

// 禁用静态路由缓存以保证实时获取新闻
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === '1';

        const news = await NewsAggregator.fetchAllNews({ forceRefresh });
        return NextResponse.json({ success: true, count: news.length, data: news });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
