import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const apiKey = process.env.YOUTUBE_API_KEY || '';

    const diagnostics = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        youtubeApiKey: {
            exists: !!apiKey,
            length: apiKey?.length || 0,
            preview: apiKey ?
                `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` :
                'NOT FOUND',
            startsWithAIza: apiKey?.startsWith('AIza') || false
        }
    };

    // 测试实际API调用
    if (apiKey) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=US&maxResults=1&key=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            diagnostics.apiTest = {
                status: response.status,
                ok: response.ok,
                hasItems: !!data.items,
                itemCount: data.items?.length || 0,
                error: data.error || null
            };
        } catch (error) {
            diagnostics.apiTest = {
                error: error.message
            };
        }
    }

    return NextResponse.json(diagnostics);
}
