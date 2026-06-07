'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/services/serviceUtils';
import styles from './NewsCard.module.css';

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

    const DELETE_THRESHOLD = -100;

    const handleTouchStart = (event) => {
        startX.current = event.touches[0].clientX;
        setIsDragging(true);
    };

    const handleTouchMove = (event) => {
        if (!isDragging) {
            return;
        }

        const currentX = event.touches[0].clientX;
        const diff = currentX - startX.current;

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
            setIsDeleting(true);
            setTranslateX(-500);

            setTimeout(() => {
                onDelete(item.id);
            }, 300);
            return;
        }

        setTranslateX(0);
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

    return (
        <div className={styles.cardWrapper}>
            <div className={styles.deleteIndicator} style={deleteIndicatorStyle}>
                <span>删除</span>
            </div>

            <Link
                href={item?.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.card}
                style={cardStyle}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className={styles.content}>
                    <div className={styles.metaTop}>
                        <div className={styles.sourceRow}>
                            {sourceChips.map((source) => (
                                <span key={source} className={styles.sourceChip}>{source}</span>
                            ))}
                            {hasMergedSources && (
                                <span className={styles.mergeBadge}>多源共振</span>
                            )}
                        </div>
                        <div className={styles.metaRight}>
                            {relativeTime && <span className={styles.time}>{relativeTime}</span>}
                            {item?.views && <span className={styles.views}>{item.views}</span>}
                        </div>
                    </div>

                    <h3 className={styles.title}>
                        {item?.titleTranslated || item?.titleOriginal || '无标题'}
                    </h3>
                </div>
            </Link>
        </div>
    );
}
