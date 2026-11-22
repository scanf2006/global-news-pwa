import { NextResponse } from 'next/server';
import { hasValidSecret } from '@/lib/requireSecret';
import { NewsAggregator } from '@/services/newsAggregator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 定时预热新闻缓存，需要 Authorization: Bearer <CRON_SECRET>
export async function GET(request) {
    if (!hasValidSecret(request)) {
        return NextResponse.json({ success: false, error: '未授权' }, { status: 401 });
    }

    const { items, updatedAt, stale, unavailableSources, staleSources } =
        await NewsAggregator.fetchAllNews({ forceRefresh: true });

    return NextResponse.json(
        {
            success: items.length > 0,
            count: items.length,
            updatedAt,
            stale,
            unavailableSources,
            staleSources,
        },
        { status: items.length > 0 ? 200 : 503 }
    );
}
