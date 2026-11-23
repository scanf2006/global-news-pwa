import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
    buildFeed,
    countNewItems,
    filterNews,
    getCandidateCount,
    removeFromFeed,
    restoreToFeed,
} from '../src/lib/feedModel.js';
import { createStaleWhileRevalidate } from '../src/lib/staleWhileRevalidate.js';
import { computeHotScore, limitItemsPerSource, parseViewCount } from '../src/services/newsRanking.js';
import { applySourceResults, updateSourceHealth } from '../src/services/newsSources.js';
import { classifyItemTopic, classifyTopic, getRegion, getRegions } from '../src/services/newsTaxonomy.js';
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

test('失败来源在保留期内沿用旧数据，超期后标记不可用', () => {
    const previous = { BBC: { items: [{ id: 'old' }], fetchedAt: 0 } };
    const retained = applySourceResults(previous, [{ source: 'BBC', items: [] }], 100, 1000);
    assert.deepEqual(retained.staleSources, ['BBC']);
    assert.equal(retained.snapshots.BBC.items[0].id, 'old');

    const expired = applySourceResults(previous, [{ source: 'BBC', items: [] }], 2000, 1000);
    assert.deepEqual(expired.unavailableSources, ['BBC']);
});

test('来源健康状态累计成功率', () => {
    const first = updateSourceHealth({}, [{ source: 'A', items: [1], durationMs: 10 }], 100);
    const second = updateSourceHealth(first, [{ source: 'A', items: [], durationMs: 20, error: 'x' }], 200);
    assert.equal(second.A.successRate, 0.5);
    assert.equal(second.A.lastSuccessAt, 100);
    assert.equal(second.A.lastError, 'x');
});

test('热度解析与排序权重', () => {
    assert.equal(parseViewCount('5.2M'), 5200000);
    assert.equal(parseViewCount('3.4万'), 34000);
    assert.equal(parseViewCount('Trending'), 0);

    const now = Date.parse(FETCHED_AT);
    const single = computeHotScore({ timestamp: FETCHED_AT, sourceList: ['A'] }, now);
    const multi = computeHotScore({ timestamp: FETCHED_AT, sourceList: ['A', 'B'] }, now);
    assert.ok(multi > single);
    assert.equal(limitItemsPerSource([{ source: 'A' }, { source: 'A' }, { source: 'B' }], 1).length, 2);
});

test('翻译后合并只跨来源进行', () => {
    const title = '多伦多市长宣布新的交通计划';
    const options = { getTitle: (item) => item.titleTranslated, threshold: 0.6, crossSourceOnly: true };
    const base = { timestamp: FETCHED_AT, titleTranslated: title };
    assert.equal(mergeSimilarNewsItems([{ ...base, id: 'a', source: 'A' }, { ...base, id: 'b', source: 'B' }], options).length, 1);
    assert.equal(mergeSimilarNewsItems([{ ...base, id: 'a', source: 'A' }, { ...base, id: 'c', source: 'A' }], options).length, 2);
});

test('地区和主题分类', () => {
    assert.equal(getRegion('CP24'), '多伦多');
    assert.equal(getRegion('微博热搜'), '中国');
    assert.equal(classifyTopic('Raptors win in overtime'), '体育');
    assert.equal(classifyTopic('Inflation slows in October'), '财经');
    assert.equal(classifyTopic('Said it was fine'), '其他');
});

test('新增来源的地区和默认主题', () => {
    assert.deepEqual(getRegions('CityNews Toronto'), ['多伦多', '加拿大']);
    assert.deepEqual(getRegions('Globe and Mail'), ['加拿大']);
    assert.deepEqual(getRegions('IT之家'), ['中国']);
    assert.equal(classifyItemTopic({ source: 'The Verge', titleOriginal: 'Said it was fine' }), '科技');
    assert.equal(classifyItemTopic({ source: 'CNBC', titleOriginal: 'Raptors win in overtime' }), '体育');
    assert.equal(classifyItemTopic({ source: 'DW', titleOriginal: 'Said it was fine' }), '其他');
});

test('补充来源使用较低的展示和候选配额', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ id: `d${index}`, source: 'DW' }));
    const core = Array.from({ length: 10 }, (_, index) => ({ id: `b${index}`, source: 'BBC News' }));
    const feed = buildFeed([...items, ...core]);
    assert.equal(feed.displayed.filter((item) => item.source === 'DW').length, 3);
    assert.equal(feed.displayed.filter((item) => item.source === 'BBC News').length, 5);
    assert.equal(getCandidateCount('DW'), 8);
    assert.equal(getCandidateCount('BBC News'), 18);
    assert.equal(limitItemsPerSource(items, getCandidateCount).length, 8);
});

test('删除补位后可撤销', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ id: String(index), source: 'A' }));
    const feed = buildFeed(items);
    const result = removeFromFeed(feed, '0', 'A');
    assert.ok(result.feed.displayed.some((item) => item.id === '5'));

    const restored = restoreToFeed(result.feed, result.removed, result.replacement);
    assert.deepEqual(restored.displayed.map((item) => item.id).sort(), ['0', '1', '2', '3', '4']);
    assert.deepEqual(restored.reserve.A.map((item) => item.id), ['5']);
});

test('筛选和新内容计数', () => {
    const items = [
        { id: '1', source: 'A', region: '全球', topic: '科技', titleTranslated: '芯片新闻', titleOriginal: 'Chip news' },
        { id: '2', source: 'B', sourceList: ['B', 'C'], region: '中国', topic: '体育', titleTranslated: '足球', titleOriginal: '足球' },
    ];
    const filters = { query: '', source: '', region: '', topic: '' };
    assert.equal(filterNews(items, { ...filters, query: 'chip' }).length, 1);
    assert.equal(filterNews(items, { ...filters, source: 'C' })[0].id, '2');
    assert.equal(filterNews([{ ...items[0], regions: ['全球', '多伦多'] }], { ...filters, region: '多伦多' }).length, 1);
    assert.equal(countNewItems([items[0]], items), 1);
    assert.equal(countNewItems([items[0]], items, ['2']), 0);
});
