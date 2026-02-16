import Link from 'next/link';
import styles from './NewsCard.module.css';

export default function NewsCard({ item }) {
    const hasThumbnail = item?.thumbnail;

    return (
        <Link
            href={item?.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.card}
        >
            {/* 图片背景层 */}
            {hasThumbnail ? (
                <div className={styles.imageBox}>
                    <img
                        src={item.thumbnail}
                        alt={item.titleTranslated || item.titleOriginal}
                        className={styles.thumbnail}
                        loading="lazy"
                    />
                </div>
            ) : (
                <div className={styles.placeholderBox}>
                    <span className={styles.placeholderIcon}>📰</span>
                </div>
            )}

            {/* 玻璃覆盖层 */}
            <div className={styles.glassOverlay}>
                <div className={styles.content}>
                    <h3 className={styles.title}>
                        {item?.titleTranslated || item?.titleOriginal || '无标题'}
                    </h3>
                </div>

                <div className={styles.meta}>
                    <span className={styles.source}>{item?.source || '未知来源'}</span>
                    {item?.views && (
                        <span className={styles.views}>👁 {item.views}</span>
                    )}
                </div>
            </div>
        </Link>
    );
}
