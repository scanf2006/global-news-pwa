import { NextResponse, after } from 'next/server';
import { NewsAggregator } from '@/services/newsAggregator';

// 禁用静态路由缓存以保证实时获取新闻
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === '1';

        const { items, unavailableSources, updatedAt, stale } = await NewsAggregator.fetchAllNews({
            forceRefresh,
            runInBackground: after,
        });

        if (items.length === 0) {
            return NextResponse.json(
                { success: false, error: '所有新闻源暂不可用', unavailableSources },
                { status: 503 }
            );
        }

        return NextResponse.json({
            success: true,
            count: items.length,
            data: items,
            unavailableSources,
            updatedAt,
            stale,
        });
    } catch (error) {
        console.error('[API] 获取新闻失败:', error);
        return NextResponse.json({ success: false, error: '获取新闻失败' }, { status: 500 });
    }
}
