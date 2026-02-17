'use client';

import { useState, useEffect } from 'react';
import NewsCard from './NewsCard';
import styles from './NewsFeed.module.css';
import { APICache } from '@/lib/cache';

export default function NewsFeed() {
    const [allNews, setAllNews] = useState([]); // 所有新闻
    const [displayedNews, setDisplayedNews] = useState([]); // 显示的新闻
    const [reservePool, setReservePool] = useState([]); // 备用池
    const [deletedIds, setDeletedIds] = useState([]); // 已删除的卡片ID
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [cacheStatus, setCacheStatus] = useState(null);

    const INITIAL_DISPLAY_COUNT = 7; // 显示 Rank 4-10 (共7条)

    const fetchNews = async (forceRefresh = false) => {
        setLoading(true);

        try {
            // 检查缓存(除非强制刷新)
            if (!forceRefresh) {
                const cached = APICache.get('news');
                if (cached) {
                    initializeNewsLists(cached);
                    setLoading(false);

                    // 获取缓存信息
                    const cacheInfo = APICache.getInfo('news');
                    if (cacheInfo) {
                        setCacheStatus({
                            fromCache: true,
                            age: Math.floor(cacheInfo.age / 1000),
                            remaining: Math.floor(cacheInfo.remaining / 1000)
                        });
                    }

                    return;
                }
            }

            // 请求API
            const res = await fetch('/api/news');
            const data = await res.json();

            if (data.success) {
                initializeNewsLists(data.data);
                setLastUpdated(new Date());

                // 缓存数据
                APICache.set('news', data.data);

                // 更新缓存状态
                setCacheStatus({
                    fromCache: false,
                    age: 0,
                    remaining: 600
                });
            }
        } catch (error) {
            console.error('Failed to fetch news:', error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    // 初始化显示列表和备用池
    const initializeNewsLists = (newsData) => {
        // 从localStorage读取已删除的ID
        const storedDeletedIds = JSON.parse(localStorage.getItem('deletedNewsIds') || '[]');
        setDeletedIds(storedDeletedIds);

        // 过滤掉已删除的新闻
        // 注意：这里先不切片，保留所有获取到的数据（预期30条）
        let availableNews = newsData.filter(item => !storedDeletedIds.includes(item.id));

        // 逻辑调整:
        // 1. 丢弃前3条 (Rank 1-3)
        // 2. 显示接下来的7条 (Rank 4-10)
        // 3. 剩余的全部放入备用池 (Rank 11-30)

        // 如果数据量不够切掉前3条，就直接显示剩余的
        if (availableNews.length > 3) {
            availableNews = availableNews.slice(3);
        }

        setAllNews(availableNews); // allNews 现在是从 Rank 4 开始的所有数据

        // 设置初始显示列表 (Rank 4-10)
        setDisplayedNews(availableNews.slice(0, INITIAL_DISPLAY_COUNT));

        // 设置备用池 (Rank 11-30)
        setReservePool(availableNews.slice(INITIAL_DISPLAY_COUNT));
    };

    // 删除卡片并补充新卡片
    const handleDeleteCard = (cardId) => {
        // 更新deletedIds并保存到localStorage
        const newDeletedIds = [...deletedIds, cardId];
        setDeletedIds(newDeletedIds);
        localStorage.setItem('deletedNewsIds', JSON.stringify(newDeletedIds));

        setDisplayedNews(prev => {
            const filtered = prev.filter(item => item.id !== cardId);

            // 从备用池取一条补充
            // 备用池已经是按顺序排列的 (Rank 11, 12, ... 30)
            // 所以直接取第一个就能满足 "先11-20，再21-30" 的需求
            if (reservePool.length > 0) {
                const newCard = reservePool[0];
                setReservePool(pool => pool.slice(1));
                return [...filtered, newCard];
            }

            // 备用池用完后，不再补充(或者从更后面的数据补充，暂无)
            return filtered;
        });
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchNews(true);
    };

    useEffect(() => {
        fetchNews();

        // 每10分钟自动刷新
        const interval = setInterval(() => {
            fetchNews(true);
        }, 10 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    // 下拉刷新处理
    const handleTouchStart = (e) => {
        if (window.scrollY === 0) {
            const touch = e.touches[0];
            window.pullStartY = touch.clientY;
        }
    };

    const handleTouchMove = (e) => {
        if (window.pullStartY && window.scrollY === 0) {
            const touch = e.touches[0];
            const pullDistance = touch.clientY - window.pullStartY;
            if (pullDistance > 100 && !isRefreshing) {
                handleRefresh();
                window.pullStartY = null;
            }
        }
    };

    const handleTouchEnd = () => {
        window.pullStartY = null;
    };

    return (
        <div
            className={styles.feedContainer}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* 刷新指示器 */}
            {isRefreshing && (
                <div style={{
                    textAlign: 'center',
                    padding: '1rem',
                    color: '#3b82f6',
                    fontSize: '0.875rem'
                }}>
                    🔄 正在刷新...
                </div>
            )}

            {/* News Grid */}
            <div className={styles.grid}>
                {loading && displayedNews.length === 0 ? (
                    <>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className={styles.skeletonCard}></div>
                        ))}
                    </>
                ) : (
                    displayedNews.map((item) => (
                        <NewsCard
                            key={item.id}
                            item={item}
                            onDelete={handleDeleteCard}
                        />
                    ))
                )}
            </div>

            {/* Footer */}
            <footer className={styles.footer}>
                <div className={styles.footerContent}>
                    <span>v0.11.0</span>
                    <span>•</span>
                    <span>下拉刷新</span>
                    <span>•</span>
                    <span>左滑删除</span>
                    <span>•</span>
                    <span>{cacheStatus?.fromCache ? '📦 缓存' : '🆕 最新'}</span>
                </div>
            </footer>
        </div>
    );
}
