'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import packageJson from '../../package.json';
import { APICache } from '@/lib/cache';
import {
    DEFAULT_FILTERS,
    EMPTY_FEED,
    buildFeed,
    countNewItems,
    filterNews,
    hasActiveFilters,
    removeFromFeed,
    restoreToFeed,
    sortFeedItems,
} from '@/lib/feedModel';
import {
    addDeletedId,
    addReadId,
    readBookmarks,
    readDeletedIds,
    readReadIds,
    removeDeletedId,
    toggleBookmark,
} from '@/lib/localCollections';
import { formatRelativeAge } from '@/services/serviceUtils';
import FeedControls from './FeedControls';
import NewsCard from './NewsCard';
import styles from './NewsFeed.module.css';

// 缓存键只跟随数据格式变化，应用升级后仍可离线查看上一份内容
const NEWS_CACHE_PREFIX = 'news_';
const NEWS_CACHE_KEY = `${NEWS_CACHE_PREFIX}v6`;
const STALE_CHECK_INTERVAL_MS = 60 * 1000;
const STALE_RESPONSE_TTL_MS = 60 * 1000;
const UNDO_TIMEOUT_MS = 6000;

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

export default function NewsFeed() {
    const [feed, setFeed] = useState(EMPTY_FEED);
    const [allItems, setAllItems] = useState([]);
    const [deletedIds, setDeletedIds] = useState([]);
    const [readIds, setReadIds] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [sourceStatus, setSourceStatus] = useState({ unavailable: [], stale: [] });
    const [pendingUpdate, setPendingUpdate] = useState(null);
    const [undoAction, setUndoAction] = useState(null);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sortMode, setSortMode] = useState('hot');
    const [view, setView] = useState('feed');
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
    const feedRef = useRef(EMPTY_FEED);
    const currentItemsRef = useRef([]);
    const undoTimerRef = useRef(null);

    const commitFeed = useCallback((nextFeed) => {
        feedRef.current = nextFeed;
        setFeed(nextFeed);
    }, []);

    // 应用一份新闻数据到页面
    const applyNewsPayload = useCallback(
        (payload) => {
            const storedDeletedIds = readDeletedIds();
            currentItemsRef.current = payload.items;
            setAllItems(payload.items);
            setDeletedIds(storedDeletedIds);
            commitFeed(buildFeed(payload.items, storedDeletedIds));
            setSourceStatus({
                unavailable: payload.unavailableSources || [],
                stale: payload.staleSources || [],
            });
            setUpdatedLabel(formatUpdatedLabel(payload.updatedAt));
            setPendingUpdate(null);
        },
        [commitFeed]
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

                if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
                    throw new Error(data.error || '返回数据格式异常');
                }

                const payload = {
                    items: data.data,
                    unavailableSources: data.unavailableSources || [],
                    staleSources: data.staleSources || [],
                    updatedAt: data.updatedAt || Date.now(),
                };

                // 服务端返回旧数据时缩短本地有效期，尽快取回后台刷新的结果
                APICache.set(
                    NEWS_CACHE_KEY,
                    payload,
                    data.stale ? STALE_RESPONSE_TTL_MS : undefined
                );

                const hasContent = currentItemsRef.current.length > 0;
                if (mode === 'force' || !hasContent) {
                    applyNewsPayload(payload);
                    return;
                }

                // 后台更新不打断阅读，有新内容时由用户决定何时替换
                const newCount = countNewItems(
                    currentItemsRef.current,
                    payload.items,
                    readDeletedIds()
                );
                setUpdatedLabel(formatUpdatedLabel(payload.updatedAt));
                setSourceStatus({
                    unavailable: payload.unavailableSources,
                    stale: payload.staleSources,
                });
                setPendingUpdate(newCount > 0 ? { payload, newCount } : null);
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

    const handleShowPendingUpdate = () => {
        if (pendingUpdate) {
            applyNewsPayload(pendingUpdate.payload);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // 删除卡片并提供短时间撤销
    const handleDeleteCard = useCallback(
        (item) => {
            setDeletedIds(addDeletedId(item.id));
            const result = removeFromFeed(feedRef.current, item.id, item.source);
            commitFeed(result.feed);
            setUndoAction({ item, removed: result.removed, replacement: result.replacement });

            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = setTimeout(() => setUndoAction(null), UNDO_TIMEOUT_MS);
        },
        [commitFeed]
    );

    const handleUndoDelete = () => {
        if (!undoAction) {
            return;
        }

        clearTimeout(undoTimerRef.current);
        setDeletedIds(removeDeletedId(undoAction.item.id));
        commitFeed(restoreToFeed(feedRef.current, undoAction.removed, undoAction.replacement));
        setUndoAction(null);
    };

    const handleToggleSaved = useCallback((item) => {
        setBookmarks(toggleBookmark(item));
    }, []);

    const handleMarkRead = useCallback((id) => {
        setReadIds(addReadId(id));
    }, []);

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
            setReadIds(readReadIds());
            setBookmarks(readBookmarks());
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
            clearTimeout(undoTimerRef.current);
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

    const sourceOptions = useMemo(
        () => [...new Set(allItems.flatMap((item) => item.sourceList || [item.source]))].sort(),
        [allItems]
    );
    const savedIds = useMemo(() => new Set(bookmarks.map((item) => item.id)), [bookmarks]);
    const readIdSet = useMemo(() => new Set(readIds), [readIds]);
    const filtersActive = hasActiveFilters(filters);

    const visibleItems = useMemo(() => {
        if (view === 'saved') {
            return sortFeedItems(filterNews(bookmarks, filters), sortMode);
        }

        if (filtersActive) {
            const deletedSet = new Set(deletedIds);
            const candidates = allItems.filter((item) => !deletedSet.has(item.id));
            return sortFeedItems(filterNews(candidates, filters), sortMode);
        }

        return sortFeedItems(feed.displayed, sortMode);
    }, [allItems, bookmarks, deletedIds, feed.displayed, filters, filtersActive, sortMode, view]);

    const emptyMessage = !isOnline && allItems.length === 0
        ? '当前离线，暂无可显示的内容'
        : view === 'saved' && bookmarks.length === 0
          ? '还没有收藏的新闻'
          : filtersActive
            ? '没有符合条件的内容'
            : '暂无数据';
    const showSkeleton = loading && view === 'feed' && allItems.length === 0;

    return (
        <div
            className={styles.feedContainer}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            <FeedControls
                filters={filters}
                onFiltersChange={setFilters}
                sources={sourceOptions}
                view={view}
                onViewChange={setView}
                savedCount={bookmarks.length}
                sortMode={sortMode}
                onSortChange={setSortMode}
                onRefresh={handleRefresh}
                refreshDisabled={isRefreshing || !isOnline}
                isRefreshing={isRefreshing}
            />

            {pendingUpdate && (
                <button type="button" className={styles.newContentButton} onClick={handleShowPendingUpdate}>
                    有 {pendingUpdate.newCount} 条新内容，点击查看
                </button>
            )}
            {isRefreshing && <div className={styles.refreshState}>正在刷新热点...</div>}
            {!isOnline && allItems.length > 0 && (
                <div className={styles.refreshState} role="status">
                    当前离线{updatedLabel ? `，内容${updatedLabel}` : ''}
                </div>
            )}
            {!isRefreshing && errorMessage && (
                <div className={styles.refreshState} role="status">
                    {errorMessage}
                </div>
            )}
            {sourceStatus.stale.length > 0 && (
                <div className={styles.refreshState} role="status">
                    暂未更新：{sourceStatus.stale.join('、')}
                </div>
            )}
            {sourceStatus.unavailable.length > 0 && (
                <div className={styles.refreshState} role="status">
                    暂不可用：{sourceStatus.unavailable.join('、')}
                </div>
            )}

            <div className={styles.grid}>
                {showSkeleton
                    ? [...Array(6)].map((_, index) => (
                          <div key={index} className={styles.skeletonCard}></div>
                      ))
                    : visibleItems.map((item) => (
                          <NewsCard
                              key={item.id}
                              item={item}
                              isRead={readIdSet.has(item.id)}
                              isSaved={savedIds.has(item.id)}
                              onDelete={() =>
                                  view === 'saved' ? handleToggleSaved(item) : handleDeleteCard(item)
                              }
                              onToggleSaved={() => handleToggleSaved(item)}
                              onRead={() => handleMarkRead(item.id)}
                          />
                      ))}

                {!showSkeleton && !loading && visibleItems.length === 0 && (
                    <div className={styles.emptyState}>{emptyMessage}</div>
                )}
            </div>

            {undoAction && (
                <div className={styles.undoToast} role="status">
                    <span>已删除</span>
                    <button type="button" className={styles.undoButton} onClick={handleUndoDelete}>
                        撤销
                    </button>
                </div>
            )}

            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <span className={styles.footerPill}>v{packageJson.version}</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>下拉刷新</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>左滑删除</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{visibleItems.length} 条展示中</span>
                    <span className={styles.footerDot}>•</span>
                    <span className={styles.footerPill}>{updatedLabel || '正在加载'}</span>
                </div>
            </footer>
        </div>
    );
}
