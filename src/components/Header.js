'use client';

import styles from './Header.module.css';

export default function Header() {
    return (
        <div className={styles.headerContainer}>
            <div className={styles.headerGlass}>
                <div className={styles.topRow}>
                    <span className={styles.kicker}>Global Pulse</span>
                    <h1 className={styles.title}>{'\u5168\u7403\u70ed\u70b9'}</h1>
                </div>
            </div>
        </div>
    );
}
