import { NextResponse } from 'next/server';
import { YouTubeAdapter } from '@/services/youtubeAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
            { error: 'Diagnostics endpoint is disabled in production' },
            { status: 403 }
        );
    }

    const diagnostics = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
    };

    try {
        const videos = await YouTubeAdapter.fetchTrending();
        diagnostics.youtubeFeeds = { ok: videos.length > 0, itemCount: videos.length };
    } catch (error) {
        diagnostics.youtubeFeeds = { ok: false, error: error.message };
    }

    return NextResponse.json(diagnostics);
}
