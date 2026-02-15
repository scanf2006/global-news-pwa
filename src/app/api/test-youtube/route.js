import { NextResponse } from 'next/server';
import { YouTubeAdapter } from '@/services/youtubeAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
    console.log('[Test] Starting YouTube test...');

    try {
        const videos = await YouTubeAdapter.fetchTrending();

        console.log('[Test] YouTube returned:', videos?.length || 0, 'videos');

        return NextResponse.json({
            success: true,
            count: videos?.length || 0,
            videos: videos,
            firstVideo: videos?.[0] || null
        });
    } catch (error) {
        console.error('[Test] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
