import { NextResponse } from 'next/server';
import { hasValidSecret } from '@/lib/requireSecret';
import { NewsAggregator } from '@/services/newsAggregator';

export const dynamic = 'force-dynamic';

// 来源健康状态：开发环境直接访问，生产环境需要 CRON_SECRET
export async function GET(request) {
    if (process.env.NODE_ENV === 'production' && !hasValidSecret(request)) {
        return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { sourceHealth, updatedAt, stale, unavailableSources, staleSources } =
        await NewsAggregator.fetchAllNews();

    return NextResponse.json({
        updatedAt,
        stale,
        unavailableSources,
        staleSources,
        sources: sourceHealth || {},
    });
}
