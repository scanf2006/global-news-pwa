import { NextResponse } from 'next/server';

// AI 摘要接口已下线，返回 410 状态码提示使用首页概览
export async function GET() {
    return NextResponse.json(
        {
            success: false,
            error: 'AI 摘要接口已移除，请直接查看首页新闻流。',
        },
        { status: 410 }
    );
}
