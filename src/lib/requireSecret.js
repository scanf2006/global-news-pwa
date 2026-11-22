import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
    return createHash('sha256').update(String(value)).digest();
}

/**
 * 校验 Authorization: Bearer <CRON_SECRET>
 */
export function hasValidSecret(request) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return false;
    }

    const header = request.headers.get('authorization') || '';
    return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
