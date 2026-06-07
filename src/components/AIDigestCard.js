'use client';

import styles from './AIDigestCard.module.css';

function buildOverview(newsItems) {
    const total = newsItems.length;
    const sourceCounts = new Map();
    const multiSourceItems = [];

    for (const item of newsItems) {
        const sources = item.sourceList?.length ? item.sourceList : [item.source];
        sources.forEach((source) => {
            sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
        });

        if ((item.sourceList?.length || 1) > 1) {
            multiSourceItems.push(item);
        }
    }

    const topSources = [...sourceCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const latestItems = newsItems
        .slice()
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 3);

    const focusItems = multiSourceItems
        .slice()
        .sort((a, b) => (b.sourceList?.length || 1) - (a.sourceList?.length || 1))
        .slice(0, 3);

    return { total, topSources, latestItems, focusItems };
}

export default function AIDigestCard({ newsItems = [] }) {
    const overview = buildOverview(newsItems);

    return (
        <section className={styles.card}>
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <span className={styles.eyebrow}>Overview</span>
                    <h2 className={styles.title}>本地热点概览</h2>
                </div>
                <span className={styles.time}>{overview.total} 条候选</span>
            </div>

            <div className={styles.content}>
                <section className={styles.primarySection}>
                    <h3 className={styles.sectionTitle}>当前盘面</h3>
                    <p className={styles.paragraph}>
                        当前列表已按时间与相似度整理，优先保留跨平台同时升温的话题，尽量减少重复刷屏。
                    </p>
                </section>

                <div className={styles.columns}>
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>来源分布</h3>
                        <div className={styles.badgeRow}>
                            {overview.topSources.map(([source, count]) => (
                                <span key={source} className={styles.badge}>
                                    <span className={styles.badgeName}>{source}</span>
                                    <span className={styles.badgeCount}>{count}</span>
                                </span>
                            ))}
                        </div>
                    </section>

                    {overview.focusItems.length > 0 && (
                        <section className={styles.section}>
                            <h3 className={styles.sectionTitle}>跨源共振</h3>
                            <ul className={styles.list}>
                                {overview.focusItems.map((item) => (
                                    <li key={item.id}>{item.titleTranslated || item.titleOriginal}</li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>最新进入列表</h3>
                        <ul className={styles.list}>
                            {overview.latestItems.map((item) => (
                                <li key={item.id}>{item.titleTranslated || item.titleOriginal}</li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </section>
    );
}
