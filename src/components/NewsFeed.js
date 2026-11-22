'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import packageJson from '../../package.json';
import { APICache } from '@/lib/cache';
import { compareNewsItems, formatRelativeAge } from '@/services/serviceUtils';
import NewsCard from './NewsCard';
import styles from './NewsFeed.module.css';

const DISPLAY_COUNT_PER_SOURCE = 5;
const RESERVE_COUNT_PER_SOURCE = 10;
const MAX_DELETED_IDS = 200;
const NEWS_CACHE_KEY = `news_v4_${packageJson.version}`;
const DELETED_IDS_KEY = 'deletedNewsIds';
const WEIBO_SOURCE = '微博热搜';
const STALE_CHECK_INTERVAL_MS = 60 * 1000;

// 新闻按发布时间倒序，热榜排在后面
function sortNews(items) {
    return [...items].sort(compareNewsItems);
}

// 验证本地缓存结构是否可用（个别标题未翻译时仍可展示原文）
function isUsableCachedNews(cached) {
    return Array.isArray(cached?.items) && cached.items.length > 0;
}

// 安全读取本地存储中的已删除 ID 列表
function readDeletedIds() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(-MAX_DELETED_IDS) : [];
    } catch {
        return [];
    }
}

export default function NewsFeed() {
    // 展示列表与替补池放在同一状态中，保证删除补位是一次原子更新
    const [feed, setFeed] = useState({ displayed: [], reserve: {} });
    const [unavailableSources, setUnavailableSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [cacheStatus, setCacheStatus] = useState(null);
    const pullStartY = useRef(null);
    const latestRequestId = useRef(0);
    const displayedNews = feed.displayed;

    // 根据新闻源分组初始化展示列表与替补池
    const initializeNewsLists = useCallback((newsData) => {
        const deletedSet = new Set(readDeletedIds());
        const groups = {};

        newsData.forEach((item) => {
            if (deletedSet.has(item.id)) {
                return;
            }

            const source = item.source || 'Other';
            if (!groups[source]) {
                groups[source] = [];
            }
            groups[source].push(item);
        });

        let initialDisplay = [];
        const nextReservePool = {};

        Object.keys(groups).forEach((source) => {
            let items = groups[source];

            // 微博热搜跳过前 3 条置顶内容
            if (source === WEIBO_SOURCE) {
                items = items.length > 3 ? items.slice(3) : [];
            }

            const toDisplay = items.slice(0, DISPLAY_COUNT_PER_SOURCE);
            const toReserve = items.slice(
                DISPLAY_COUNT_PER_SOURCE,
                DISPLAY_COUNT_PER_SOURCE + RESERVE_COUNT_PER_SOURCE
            );

            initialDisplay = initialDisplay.concat(toDisplay);
            nextReservePool[source] = toReserve;
        });

        setFeed({ displayed: sortNews(initialDisplay), reserve: nextReservePool });
    }, []);

    // 拉取新闻：cache 优先读本地缓存，network 走服务端缓存，force 请求服务端重新抓取
    const fetchNews = useCallback(
        async (mode = 'cache') => {
            const requestId = latestRequestId.current + 1;
            latestRequestId.current = requestId;
            setLoading(true);
            setErrorMessage('');

            try {
                if (mode === 'cache') {
                    const cached = APICache.get(NEWS_CACHE_KEY);
                    if (isUsableCachedNews(cached)) {
                        initializeNewsLists(cached.items);
                        setUnavailableSources(cached.unavailableSources || []);
                        const cacheInfo = APICache.getInfo(NEWS_CACHE_KEY);
                        if (cacheInfo) {
                            setCacheStatus({
                                fromCache: true,
                                age: Math.floor(cacheInfo.age / 1000),
                                remaining: Math.floor(cacheInfo.remaining / 1000),
                            });
                        }
                        return;
                    }

                    if (cached) {
                        APICache.remove(NEWS_CACHE_KEY);
                    }
                }

                const endpoint = mode === 'force' ? '/api/news?refresh=1' : '/api/news';
                const response = await fetch(endpoint);
                if (!response.ok) {
                    throw new Error(`请求失败 (${response.status})`);
                }

                const data = await response.json();

                // 已有更新的请求发出时，丢弃这次过期响应
                if (requestId !== latestRequestId.current) {
                    return;
                }

                if (data.success && Array.isArray(data.data) && data.data.length > 0) {
                    const nextUnavailableSources = data.unavailableSources || [];
                    initializeNewsLists(data.data);
                    setUnavailableSources(nextUnavailableSources);
                    APICache.set(NEWS_CACHE_KEY, {
                        items: data.data,
                        unavailableSources: nextUnavailableSources,
                    });
                    setCacheStatus({
                        fromCache: false,
                        age: 0,
                        remaining: 600,
                    });
                } else {
                    throw new Error(data.error || '返回数据格式异常');
                }
            } catch (error) {
                if (requestId === latestRequestId.current) {
                    console.error('获取新闻失败:', error);
                    setErrorMessage('刷新失败，已为您保留当前内容');
                }
            } finally {
                if (requestId === latestRequestId.current) {
                    setLoading(false);
                    setIsRefreshing(false);
                }
            }
        },
        [initializeNewsLists]
    );

    // 删除指定卡片并从同源替补池补充一条新闻
    const handleDeleteCard = (cardId, source) => {
        // 每次从 localStorage 读取最新列表，避免延迟回调拿到旧状态
        const nextDeletedIds = [...readDeletedIds().filter((id) => id !== cardId), cardId].slice(
            -MAX_DELETED_IDS
        );
        try {
            localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(nextDeletedIds));
        } catch (error) {
            console.error('保存删除记录失败:', error);
        }

        setFeed((previous) => {
            if (!previous.displayed.some((item) => item.id === cardId)) {
                return previous;
            }

            const remaining = previous.displayed.filter((item) => item.id !== cardId);
            const [replacementItem, ...restReserve] = previous.reserve[source] || [];

            if (!replacementItem) {
                return { ...previous, displayed: remaining };
            }

            return {
                displayed: sortNews([...remaining, replacementItem]),
                reserve: { ...previous.reserve, [source]: restReserve },
            };
        });
    };

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchNews('force');
    }, [fetchNews]);

    useEffect(() => {
        // 推迟到 effect 之后执行，避免同步 setState 引发级联渲染
        const initialLoad = setTimeout(() => fetchNews(), 0);

        // 仅在页面可见且本地缓存过期时刷新，普通刷新复用服务端缓存
        const refreshIfStale = () => {
            if (document.hidden) {
                return;
            }

            const cacheInfo = APICache.getInfo(NEWS_CACHE_KEY);
            if (!cacheInfo || cacheInfo.expired) {
                fetchNews('network');
            }
        };

        const interval = setInterval(refreshIfStale, STALE_CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', refreshIfStale);

        return () => {
            clearTimeout(initialLoad);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', refreshIfStale);
        };
    }, [fetchNews]);

    const handleTouchStart = (event) => {
        if (window.scrollY === 0) {
            pullStartY.current = event.touches[0].clientY;
        }
    };

    const handleTouchMove = (event) => {
        if (pullStartY.current === null || window.scrollY !== 0) {
            return;
        }

        const pullDistance = event.touches[0].clientY - pullStartY.current;
        if (pullDistance > 100 && !isRefreshing) {
            handleRefresh();
            pullStartY.current = null;
        }
    };

    const handleTouchEnd = () => {
        pullStartY.current = null;
    };

    const cacheText = cacheStatus?.fromCache
        ? `缓存 ${formatRelativeAge(cacheStatus.age)}`
        : '最新数据';

    return (
        <div
            className={styles.feedContainer}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            <div className={styles.toolbar}>
                <button
                    type="button"
                    className={styles.refreshButton}
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? '刷新中…' : '刷新'}
                </button>
            </div>

            {isRefreshing && <div className={styles.refreshState}>正在刷新热点...</div>}
            {!isRefreshing && errorMessage && (
                <div className={styles.refreshState} role="status">
                    {errorMessage}
                </div>
            )}
            {unavailableSources.length > 0 && (
                <div className={styles.refreshState} role="status">
                    暂不可用：{unavailableSources.join('、')}
                </div>
            )}

            <div className={styles.grid}>
                {loading && displayedNews.length === 0 ? (
                    [...Array(6)].map((_, index) => (
                        <div key={index} className={styles.skeletonCard}></div>
                    ))
                ) : (
                    displayedNews.map((item) => (
                        <NewsCard
                            key={item.id}
                            item={item}
                            onDelete={() => handleDeleteCard(item.id, item.source)}
                        />
                    ))
                )}

                {!loading && displayedNews.length === 0 && (
                    <div className={styles.emptyState}>暂无数据</div>
                )}
            </div>

            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <span className={styles.footerPill}>v{packageJson.version}</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>下拉刷新</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>左滑删除</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{displayedNews.length} 条展示中</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{cacheText}</span>
                </div>
            </footer>
        </div>
    );
}
