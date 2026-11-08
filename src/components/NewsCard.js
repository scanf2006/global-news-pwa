'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/services/serviceUtils';
import styles from './NewsCard.module.css';

// 获取展示在卡片顶部的来源标签（最多展示 3 个）
function getSourceChips(item) {
    if (item?.sourceList?.length) {
        return item.sourceList.slice(0, 3);
    }

    return item?.source ? [item.source] : ['未知来源'];
}

export default function NewsCard({ item, onDelete }) {
    const [translateX, setTranslateX] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const hasSwipedRef = useRef(false);

    const DELETE_THRESHOLD = -100;

    // 触发卡片移除动画并回调父组件删除
    const triggerDelete = () => {
        if (isDeleting) {
            return;
        }
        setIsDeleting(true);
        setTranslateX(-500);

        setTimeout(() => {
            onDelete(item.id);
        }, 300);
    };

    const handleTouchStart = (event) => {
        startX.current = event.touches[0].clientX;
        hasSwipedRef.current = false;
        setIsDragging(true);
    };

    const handleTouchMove = (event) => {
        if (!isDragging) {
            return;
        }

        const currentX = event.touches[0].clientX;
        const diff = currentX - startX.current;

        if (Math.abs(diff) > 10) {
            hasSwipedRef.current = true;
        }

        if (diff < 0) {
            setTranslateX(diff);
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) {
            return;
        }

        setIsDragging(false);

        if (translateX < DELETE_THRESHOLD) {
            triggerDelete();
            return;
        }

        setTranslateX(0);
    };

    // 防止左滑拖拽释放时误触发链接点击跳转
    const handleCardClick = (event) => {
        if (hasSwipedRef.current) {
            event.preventDefault();
            hasSwipedRef.current = false;
        }
    };

    // 支持桌面端与无障碍按钮直接删除卡片
    const handleDeleteButtonClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerDelete();
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

    const relativeTime = formatRelativeTime(item?.timestamp);
    const sourceChips = getSourceChips(item);
    const hasMergedSources = (item?.sourceList?.length || 0) > 1;
    const translatedTitle = item?.titleTranslated || item?.titleOriginal || '无标题';

    return (
        <div className={styles.cardWrapper}>
            <div className={styles.deleteIndicator} style={deleteIndicatorStyle}>
                <div className={styles.deleteAction}>
                    <span className={styles.deleteLabel}>删除</span>
                </div>
            </div>

            <Link
                href={item?.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.card}
                style={cardStyle}
                onClick={handleCardClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                                className={styles.dismissButton}
                                onClick={handleDeleteButtonClick}
                                aria-label="删除此条新闻"
                                title="删除此条新闻"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div className={styles.titleBlock}>
                        <h3 className={styles.title}>{translatedTitle}</h3>
                        {relativeTime && <span className={styles.titleTime}>{relativeTime}</span>}
                    </div>
                </div>
            </Link>
        </div>
    );
}
