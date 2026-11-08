'use client';

import styles from './Header.module.css';

// 顶部玻璃拟态导航栏组件
export default function Header() {
    return (
        <div className={styles.headerContainer}>
            <div className={styles.headerGlass}>
                <div className={styles.topRow}>
                    <span className={styles.kicker}>Global Pulse</span>
                    <h1 className={styles.title}>全球热点</h1>
                </div>
            </div>
        </div>
    );
}
