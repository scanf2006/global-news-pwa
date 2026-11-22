'use client';

import { useRef, useState } from 'react';
import { formatRelativeTime } from '@/services/serviceUtils';
import styles from './NewsCard.module.css';

const DELETE_THRESHOLD = -100;
const GESTURE_LOCK_DISTANCE = 10;

// 获取展示在卡片顶部的来源标签（最多展示 3 个）
function getSourceChips(item) {
    if (item?.sourceList?.length) {
        return item.sourceList.slice(0, 3);
    }

    return item?.source ? [item.source] : ['未知来源'];
}

export default function NewsCard({ item, isRead, isSaved, onDelete, onToggleSaved, onRead }) {
    const [translateX, setTranslateX] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const touchStart = useRef({ x: 0, y: 0 });
    const gestureAxis = useRef(null);
    const hasSwipedRef = useRef(false);

    // 触发卡片移除动画并回调父组件删除
    const triggerDelete = () => {
        if (isDeleting) {
            return;
        }
        setIsDeleting(true);
        setTranslateX(-500);

        setTimeout(() => {
            onDelete();
        }, 300);
    };

    const handleTouchStart = (event) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
        gestureAxis.current = null;
        hasSwipedRef.current = false;
        setIsDragging(true);
    };

    const handleTouchMove = (event) => {
        if (!isDragging) {
            return;
        }

        const touch = event.touches[0];
        const diffX = touch.clientX - touchStart.current.x;
        const diffY = touch.clientY - touchStart.current.y;

        // 移动超过阈值后锁定方向，纵向滚动不再带动卡片
        if (!gestureAxis.current) {
            if (Math.max(Math.abs(diffX), Math.abs(diffY)) < GESTURE_LOCK_DISTANCE) {
                return;
            }
            gestureAxis.current = Math.abs(diffX) > Math.abs(diffY) ? 'x' : 'y';
            hasSwipedRef.current = gestureAxis.current === 'x';
        }

        if (gestureAxis.current === 'x') {
            setTranslateX(Math.min(diffX, 0));
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) {
            return;
        }

        setIsDragging(false);

        if (gestureAxis.current === 'x' && translateX < DELETE_THRESHOLD) {
            triggerDelete();
            return;
        }

        setTranslateX(0);
    };

    // 手势被系统中断时恢复卡片位置
    const handleTouchCancel = () => {
        setIsDragging(false);
        gestureAxis.current = null;
        hasSwipedRef.current = false;
        if (!isDeleting) {
            setTranslateX(0);
        }
    };

    // 防止左滑释放时误触发链接或删除按钮
    const handleClickCapture = (event) => {
        if (hasSwipedRef.current) {
            event.preventDefault();
            event.stopPropagation();
            hasSwipedRef.current = false;
        }
    };

    const cardStyle = {
        transform: `translateX(${translateX}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        opacity: isDeleting ? 0 : 1,
    };

    const deleteIndicatorStyle = {
        opacity: translateX < DELETE_THRESHOLD / 2 ? 1 : 0,
        transition: 'opacity 0.2s',
    };

    const timeLabel = item?.hasPublishedTime === false ? '热榜' : formatRelativeTime(item?.timestamp);
    const sourceChips = getSourceChips(item);
    const hasMergedSources = (item?.sourceList?.length || 0) > 1;
    const translatedTitle = item?.titleTranslated || item?.titleOriginal || '无标题';
    const canShowOriginal =
        Boolean(item?.titleOriginal) && item.titleOriginal !== item?.titleTranslated;
    const displayTitle = showOriginal && canShowOriginal ? item.titleOriginal : translatedTitle;

    return (
        <div className={styles.cardWrapper}>
            <div className={styles.deleteIndicator} style={deleteIndicatorStyle}>
                <div className={styles.deleteAction}>
                    <span className={styles.deleteLabel}>删除</span>
                </div>
            </div>

            <article
                className={styles.card}
                style={cardStyle}
                onClickCapture={handleClickCapture}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
            >
                <div className={styles.content}>
                    <div className={styles.metaTop}>
                        <div className={styles.sourceRow}>
                            {sourceChips.map((source) => (
                                <span key={source} className={styles.sourceChip}>
                                    {source}
                                </span>
                            ))}
                            {hasMergedSources && (
                                <span className={styles.mergeBadge}>多源共振</span>
                            )}
                        </div>
                        <div className={styles.metaRight}>
                            {item?.views && <span className={styles.views}>{item.views}</span>}
                            <button
                                type="button"
                                className={isSaved ? styles.saveButtonActive : styles.saveButton}
                                onClick={onToggleSaved}
                                aria-pressed={Boolean(isSaved)}
                                aria-label={isSaved ? '取消收藏' : '收藏此条新闻'}
                                title={isSaved ? '取消收藏' : '收藏'}
                            >
                                {isSaved ? '★' : '☆'}
                            </button>
                            <button
                                type="button"
                                className={styles.dismissButton}
                                onClick={triggerDelete}
                                aria-label="删除此条新闻"
                                title="删除此条新闻"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div className={styles.titleBlock}>
                        <h3 className={isRead ? styles.titleRead : styles.title}>
                            <a
                                href={item?.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.titleLink}
                                onClick={onRead}
                            >
                                {displayTitle}
                            </a>
                        </h3>
                        <div className={styles.titleMeta}>
                            {timeLabel && <span className={styles.titleTime}>{timeLabel}</span>}
                            {item?.topic && item.topic !== '其他' && (
                                <span className={styles.titleTime}>{item.topic}</span>
                            )}
                            {canShowOriginal && (
                                <button
                                    type="button"
                                    className={styles.originalButton}
                                    aria-pressed={showOriginal}
                                    onClick={() => setShowOriginal((value) => !value)}
                                >
                                    {showOriginal ? '看译文' : '看原文'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </article>
        </div>
    );
}
