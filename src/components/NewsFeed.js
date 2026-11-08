'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import packageJson from '../../package.json';
import { APICache } from '@/lib/cache';
import { containsCjk, formatRelativeAge } from '@/services/serviceUtils';
import NewsCard from './NewsCard';
import styles from './NewsFeed.module.css';

const DISPLAY_COUNT_PER_SOURCE = 5;
const RESERVE_COUNT_PER_SOURCE = 10;
const MAX_DELETED_IDS = 200;
const NEWS_CACHE_KEY = `news_v2_${packageJson.version}`;
const DELETED_IDS_KEY = 'deletedNewsIds';
const WEIBO_SOURCE = '微博热搜';

// 按发布时间倒序排列新闻
function sortByTimestamp(items) {
    return [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// 检查英文新闻是否缺失中文翻译
function hasMissingEnglishTranslation(item) {
    const original = String(item?.titleOriginal || '').trim();
    const translated = String(item?.titleTranslated || '').trim();

    if (!original || containsCjk(original)) {
        return false;
    }

    if (!translated) {
        return true;
    }

    return translated === original;
}

// 验证本地缓存中的新闻列表是否完整可用
function isUsableCachedNews(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return false;
    }

    return !items.some(hasMissingEnglishTranslation);
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
    const [displayedNews, setDisplayedNews] = useState([]);
    const [reservePool, setReservePool] = useState({});
    const [deletedIds, setDeletedIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [cacheStatus, setCacheStatus] = useState(null);
    const pullStartY = useRef(null);

    // 根据新闻源分组初始化展示列表与替补池
    const initializeNewsLists = useCallback((newsData) => {
        const storedDeletedIds = readDeletedIds();
        setDeletedIds(storedDeletedIds);

        const deletedSet = new Set(storedDeletedIds);
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

        setDisplayedNews(sortByTimestamp(initialDisplay));
        setReservePool(nextReservePool);
    }, []);

    // 拉取新闻数据（支持优先读取缓存或强制刷新）
    const fetchNews = useCallback(
        async (forceRefresh = false) => {
            setLoading(true);
            setErrorMessage('');

            try {
                if (!forceRefresh) {
                    const cached = APICache.get(NEWS_CACHE_KEY);
                    if (isUsableCachedNews(cached)) {
                        initializeNewsLists(cached);
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

                const endpoint = forceRefresh ? '/api/news?refresh=1' : '/api/news';
                const response = await fetch(endpoint);
                if (!response.ok) {
                    throw new Error(`请求失败 (${response.status})`);
                }

                const data = await response.json();

                if (data.success && Array.isArray(data.data)) {
                    initializeNewsLists(data.data);
                    APICache.set(NEWS_CACHE_KEY, data.data);
                    setCacheStatus({
                        fromCache: false,
                        age: 0,
                        remaining: 600,
                    });
                } else {
                    throw new Error(data.error || '返回数据格式异常');
                }
            } catch (error) {
                console.error('获取新闻失败:', error);
                setErrorMessage('刷新失败，已为您保留当前内容');
            } finally {
                setLoading(false);
                setIsRefreshing(false);
            }
        },
        [initializeNewsLists]
    );

    // 删除指定卡片并从同源替补池补充一条新闻
    const handleDeleteCard = (cardId, source) => {
        const nextDeletedIds = [...deletedIds.filter((id) => id !== cardId), cardId].slice(
            -MAX_DELETED_IDS
        );
        setDeletedIds(nextDeletedIds);
        localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(nextDeletedIds));

        const nextReservePoolState = { ...reservePool };
        const currentSourceReserve = nextReservePoolState[source] || [];
        const replacementItem = currentSourceReserve[0] || null;

        if (replacementItem) {
            nextReservePoolState[source] = currentSourceReserve.slice(1);
            setReservePool(nextReservePoolState);
        }

        setDisplayedNews((previous) => {
            const filtered = previous.filter((item) => item.id !== cardId);
            return replacementItem ? sortByTimestamp([...filtered, replacementItem]) : filtered;
        });
    };

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchNews(true);
    }, [fetchNews]);

    useEffect(() => {
        fetchNews();
        const interval = setInterval(() => {
            fetchNews(true);
        }, 10 * 60 * 1000);

        return () => clearInterval(interval);
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
        >
            {isRefreshing && <div className={styles.refreshState}>正在刷新热点...</div>}
            {!isRefreshing && errorMessage && (
                <div className={styles.refreshState} role="status">
                    {errorMessage}
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
