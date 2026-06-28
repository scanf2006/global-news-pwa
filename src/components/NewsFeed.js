'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import packageJson from '../../package.json';
import { APICache } from '@/lib/cache';
import { containsCjk, formatRelativeAge } from '@/services/serviceUtils';
import NewsCard from './NewsCard';
import styles from './NewsFeed.module.css';

const DISPLAY_COUNT_PER_SOURCE = 5;
const RESERVE_COUNT_PER_SOURCE = 10;
const NEWS_CACHE_KEY = `news_v2_${packageJson.version}`;
const DELETED_IDS_KEY = 'deletedNewsIds';
const WEIBO_SOURCE = '\u5fae\u535a\u70ed\u641c';

function sortByTimestamp(items) {
    return [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

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

function isUsableCachedNews(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return false;
    }

    return !items.some(hasMissingEnglishTranslation);
}

export default function NewsFeed() {
    const [displayedNews, setDisplayedNews] = useState([]);
    const [reservePool, setReservePool] = useState({});
    const [deletedIds, setDeletedIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [cacheStatus, setCacheStatus] = useState(null);
    const pullStartY = useRef(null);

    const initializeNewsLists = useCallback((newsData) => {
        const storedDeletedIds = JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]');
        setDeletedIds(storedDeletedIds);

        const groups = {};
        newsData.forEach((item) => {
            if (storedDeletedIds.includes(item.id)) {
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

    const fetchNews = useCallback(
        async (forceRefresh = false) => {
            setLoading(true);

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

                const response = await fetch('/api/news');
                const data = await response.json();

                if (data.success) {
                    initializeNewsLists(data.data);
                    APICache.set(NEWS_CACHE_KEY, data.data);
                    setCacheStatus({
                        fromCache: false,
                        age: 0,
                        remaining: 600,
                    });
                }
            } catch (error) {
                console.error('Failed to fetch news:', error);
            } finally {
                setLoading(false);
                setIsRefreshing(false);
            }
        },
        [initializeNewsLists]
    );

    const handleDeleteCard = (cardId, source) => {
        const nextDeletedIds = [...deletedIds, cardId];
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
        ? `\u7f13\u5b58 ${formatRelativeAge(cacheStatus.age)}`
        : '\u6700\u65b0\u6570\u636e';

    return (
        <div
            className={styles.feedContainer}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {isRefreshing && (
                <div className={styles.refreshState}>
                    {'\u6b63\u5728\u5237\u65b0\u70ed\u70b9...'}
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
                    <div className={styles.emptyState}>{'\u6682\u65e0\u6570\u636e'}</div>
                )}
            </div>

            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <span className={styles.footerPill}>v{packageJson.version}</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{'\u4e0b\u62c9\u5237\u65b0'}</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{'\u5de6\u6ed1\u5220\u9664'}</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>
                        {displayedNews.length} {'\u6761\u5c55\u793a\u4e2d'}
                    </span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{cacheText}</span>
                </div>
            </footer>
        </div>
    );
}
