import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json(
        {
            success: false,
            error: 'AI digest has been removed. Use the local overview card on the home page instead.',
        },
        { status: 410 }
    );
}
