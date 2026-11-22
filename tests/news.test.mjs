import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createStaleWhileRevalidate } from '../src/lib/staleWhileRevalidate.js';
import {
    dedupeNewsItems,
    mergeSimilarNewsItems,
    normalizeNewsItems,
} from '../src/services/newsNormalizer.js';
import {
    TWITTER_SOURCE,
    calculateTokenSimilarity,
    compareNewsItems,
    fetchWithTimeout,
    formatRelativeAge,
    isLikelyUsefulTitle,
    sanitizeHttpUrl,
} from '../src/services/serviceUtils.js';

const FETCHED_AT = '2026-11-22T12:00:00.000Z';

function newsItem(overrides = {}) {
    return {
        id: 'a',
        source: 'BBC News',
        titleOriginal: 'Toronto mayor announces new transit plan',
        url: 'https://example.com/a',
        timestamp: '2026-11-22T10:00:00.000Z',
        ...overrides,
    };
}

test('相似度不合并数字不同或词序相反的标题', () => {
    assert.equal(calculateTokenSimilarity('Apple launches iPhone 16', 'Apple launches iPhone 17'), 0);
    assert.equal(calculateTokenSimilarity('Israel strikes Iran', 'Iran strikes Israel'), 0);
    assert.ok(
        calculateTokenSimilarity(
            'Toronto mayor announces new transit plan today',
            'Toronto mayor announces new transit plan'
        ) >= 0.72
    );
});

test('X 来源保留短趋势词，其他来源继续过滤', () => {
    assert.equal(isLikelyUsefulTitle('Lakers', TWITTER_SOURCE), true);
    assert.equal(isLikelyUsefulTitle('Lakers', 'BBC News'), false);
});

test('只允许 http 和 https 链接', () => {
    assert.equal(sanitizeHttpUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeHttpUrl('not a url'), null);
});

test('规范化时区分发布时间与热榜抓取时间', () => {
    const [published, invalid, trending] = normalizeNewsItems(
        [
            newsItem({ timestamp: 'Sun, 22 Nov 2026 10:00:00 GMT' }),
            newsItem({ id: 'b', timestamp: 'bad-date' }),
            newsItem({ id: 'c', source: TWITTER_SOURCE, timestamp: FETCHED_AT }),
        ],
        FETCHED_AT
    );

    assert.equal(published.timestamp, '2026-11-22T10:00:00.000Z');
    assert.equal(published.hasPublishedTime, true);
    assert.equal(invalid.timestamp, FETCHED_AT);
    assert.equal(invalid.hasPublishedTime, false);
    assert.equal(trending.hasPublishedTime, false);
});

test('规范化时丢弃不安全链接，去重时处理重复 ID', () => {
    assert.equal(normalizeNewsItems([newsItem({ url: 'javascript:alert(1)' })]).length, 0);
    assert.equal(
        dedupeNewsItems([newsItem(), newsItem({ titleOriginal: 'A different headline here' })]).length,
        1
    );
});

test('合并时真实发布时间优先于热榜时间', () => {
    const [merged] = mergeSimilarNewsItems([
        newsItem({ id: 'x', source: TWITTER_SOURCE, timestamp: FETCHED_AT, hasPublishedTime: false }),
        newsItem({ id: 'b', hasPublishedTime: true }),
    ]);

    assert.deepEqual(merged.sourceList, [TWITTER_SOURCE, 'BBC News']);
    assert.equal(merged.timestamp, '2026-11-22T10:00:00.000Z');
    assert.equal(merged.hasPublishedTime, true);
});

test('排序时新闻按时间倒序，热榜排在后面并保持原顺序', () => {
    const sorted = [
        { id: 'hot1', hasPublishedTime: false, timestamp: FETCHED_AT },
        { id: 'old', hasPublishedTime: true, timestamp: '2026-11-22T08:00:00.000Z' },
        { id: 'hot2', hasPublishedTime: false, timestamp: FETCHED_AT },
        { id: 'new', hasPublishedTime: true, timestamp: '2026-11-22T11:00:00.000Z' },
    ].sort(compareNewsItems);

    assert.deepEqual(sorted.map((item) => item.id), ['new', 'old', 'hot1', 'hot2']);
});

test('相对时间超过一天时显示天数', () => {
    assert.equal(formatRelativeAge(3600), '1h');
    assert.equal(formatRelativeAge(3 * 86400), '3d');
});

test('fetchWithTimeout 覆盖响应体读取', async () => {
    const server = http.createServer((request, response) => {
        response.writeHead(200);
        response.write('partial');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
        await assert.rejects(
            fetchWithTimeout(`http://127.0.0.1:${server.address().port}/`, {}, 100),
            { name: 'AbortError' }
        );
    } finally {
        server.closeAllConnections();
        server.close();
    }
});

function createLoader(load) {
    const clock = { now: 0 };
    const get = createStaleWhileRevalidate({
        load,
        isUsable: (value) => value?.items?.length > 0,
        emptyValue: { items: [] },
        freshMs: 100,
        maxStaleMs: 1000,
        refreshCooldownMs: 50,
        now: () => clock.now,
    });
    return { clock, get };
}

test('SWR 过期后立即返回旧数据并在后台刷新', async () => {
    let version = 0;
    const { clock, get } = createLoader(async () => ({ items: [++version] }));
    assert.deepEqual((await get()).items, [1]);

    clock.now = 200;
    let backgroundTask;
    const stale = await get({ runInBackground: (task) => { backgroundTask = task; } });
    assert.equal(stale.stale, true);
    assert.deepEqual(stale.items, [1]);

    await backgroundTask();
    const fresh = await get();
    assert.equal(fresh.stale, false);
    assert.deepEqual(fresh.items, [2]);
});

test('SWR 刷新失败时保留最后一份有效数据', async () => {
    let shouldFail = false;
    const { clock, get } = createLoader(async () => {
        if (shouldFail) {
            throw new Error('offline');
        }
        return { items: ['good'] };
    });
    await get();

    shouldFail = true;
    clock.now = 200;
    const result = await get({ force: true });
    assert.equal(result.stale, true);
    assert.deepEqual(result.items, ['good']);
});

test('SWR 合并并发加载，强制刷新受冷却限制', async () => {
    let calls = 0;
    const { clock, get } = createLoader(async () => ({ items: [++calls] }));
    await Promise.all([get(), get(), get()]);
    assert.equal(calls, 1);

    clock.now = 10;
    await get({ force: true });
    assert.equal(calls, 1);

    clock.now = 60;
    await get({ force: true });
    assert.equal(calls, 2);
});
