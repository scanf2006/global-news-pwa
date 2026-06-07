'use client';

import styles from './Header.module.css';

export default function Header() {
    return (
        <div className={styles.headerContainer}>
            <div className={styles.headerGlass}>
                <div className={styles.topRow}>
                    <span className={styles.kicker}>Global Pulse</span>
                    <h1 className={styles.title}>全球热点</h1>
                </div>
                <p className={styles.subtitle}>
                    聚合全球主流媒体与平台热度，自动整理成更适合手机和桌面扫读的本地新闻流
                </p>
            </div>
        </div>
    );
}
