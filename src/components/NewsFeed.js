'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import packageJson from '../../package.json';
import { APICache } from '@/lib/cache';
import { compareNewsItems, formatRelativeAge } from '@/services/serviceUtils';
import NewsCard from './NewsCard';
import styles from './NewsFeed.module.css';

const DISPLAY_COUNT_PER_SOURCE = 5;
const RESERVE_COUNT_PER_SOURCE = 10;
const MAX_DELETED_IDS = 200;
// 缓存键只跟随数据格式变化，应用升级后仍可离线查看上一份内容
const NEWS_CACHE_PREFIX = 'news_';
const NEWS_CACHE_KEY = `${NEWS_CACHE_PREFIX}v5`;
const DELETED_IDS_KEY = 'deletedNewsIds';
const WEIBO_SOURCE = '微博热搜';
const STALE_CHECK_INTERVAL_MS = 60 * 1000;
const STALE_RESPONSE_TTL_MS = 60 * 1000;

// 新闻按发布时间倒序，热榜排在后面
function sortNews(items) {
    return [...items].sort(compareNewsItems);
}

// 验证本地缓存结构是否可用（个别标题未翻译时仍可展示原文）
function isUsableCachedNews(cached) {
    return Array.isArray(cached?.items) && cached.items.length > 0;
}

// 生成内容更新时间的展示文案
function formatUpdatedLabel(updatedAt) {
    if (!updatedAt) {
        return '';
    }

    const ageSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
    return ageSeconds < 60 ? '刚刚更新' : `${formatRelativeAge(ageSeconds)}前更新`;
}

function subscribeOnlineStatus(callback) {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
    };
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
    const [updatedLabel, setUpdatedLabel] = useState('');
    const isOnline = useSyncExternalStore(
        subscribeOnlineStatus,
        () => navigator.onLine,
        () => true
    );
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

    // 应用一份新闻数据到页面
    const applyNewsPayload = useCallback(
        (payload) => {
            initializeNewsLists(payload.items);
            setUnavailableSources(payload.unavailableSources || []);
            setUpdatedLabel(formatUpdatedLabel(payload.updatedAt));
        },
        [initializeNewsLists]
    );

    // 拉取新闻：cache 先展示本地内容再按需更新，network 走服务端缓存，force 请求重新抓取
    const fetchNews = useCallback(
        async (mode = 'cache') => {
            const requestId = latestRequestId.current + 1;
            latestRequestId.current = requestId;
            setLoading(true);
            setErrorMessage('');

            try {
                if (mode === 'cache') {
                    const cached = APICache.getEntry(NEWS_CACHE_KEY);
                    if (isUsableCachedNews(cached?.data)) {
                        applyNewsPayload(cached.data);

                        if (!cached.expired || !navigator.onLine) {
                            return;
                        }

                        // 旧内容已展示，继续在后台更新
                        setIsRefreshing(true);
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
                    const payload = {
                        items: data.data,
                        unavailableSources: data.unavailableSources || [],
                        updatedAt: data.updatedAt || Date.now(),
                    };
                    applyNewsPayload(payload);
                    // 服务端返回旧数据时缩短本地有效期，尽快取回后台刷新的结果
                    APICache.set(
                        NEWS_CACHE_KEY,
                        payload,
                        data.stale ? STALE_RESPONSE_TTL_MS : undefined
                    );
                } else {
                    throw new Error(data.error || '返回数据格式异常');
                }
            } catch (error) {
                if (requestId === latestRequestId.current) {
                    console.error('获取新闻失败:', error);
                    if (navigator.onLine) {
                        setErrorMessage('刷新失败，已为您保留当前内容');
                    }
                }
            } finally {
                if (requestId === latestRequestId.current) {
                    setLoading(false);
                    setIsRefreshing(false);
                }
            }
        },
        [applyNewsPayload]
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
        if (!navigator.onLine) {
            return;
        }

        setIsRefreshing(true);
        fetchNews('force');
    }, [fetchNews]);

    useEffect(() => {
        // 推迟到 effect 之后执行，避免同步 setState 引发级联渲染
        const initialLoad = setTimeout(() => {
            APICache.pruneByPrefix(NEWS_CACHE_PREFIX, NEWS_CACHE_KEY);
            fetchNews();
        }, 0);

        // 仅在页面可见且本地缓存过期时刷新，普通刷新复用服务端缓存
        const refreshIfStale = () => {
            if (document.hidden) {
                return;
            }

            const cached = APICache.getEntry(NEWS_CACHE_KEY);
            if (cached?.data?.updatedAt) {
                setUpdatedLabel(formatUpdatedLabel(cached.data.updatedAt));
            }

            if (navigator.onLine && (!cached || cached.expired)) {
                fetchNews('network');
            }
        };

        const interval = setInterval(refreshIfStale, STALE_CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', refreshIfStale);
        window.addEventListener('online', refreshIfStale);

        return () => {
            clearTimeout(initialLoad);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', refreshIfStale);
            window.removeEventListener('online', refreshIfStale);
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
                    disabled={isRefreshing || !isOnline}
                >
                    {isRefreshing ? '刷新中…' : '刷新'}
                </button>
            </div>

            {isRefreshing && <div className={styles.refreshState}>正在刷新热点...</div>}
            {!isOnline && displayedNews.length > 0 && (
                <div className={styles.refreshState} role="status">
                    当前离线{updatedLabel ? `，内容${updatedLabel}` : ''}
                </div>
            )}
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
                    <div className={styles.emptyState}>
                        {isOnline ? '暂无数据' : '当前离线，暂无可显示的内容'}
                    </div>
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
                    <span className={styles.footerPill}>{updatedLabel || '正在加载'}</span>
                </div>
            </footer>
        </div>
    );
}
