'use client';

import { DEFAULT_FILTERS, hasActiveFilters } from '@/lib/feedModel';
import { REGIONS, TOPICS } from '@/services/newsTaxonomy';
import styles from './FeedControls.module.css';

function FilterSelect({ label, value, options, onChange }) {
    return (
        <select
            className={styles.select}
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            <option value="">{label}</option>
            {options.map((option) => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    );
}

// 新闻流的视图切换、搜索、筛选与排序
export default function FeedControls({
    filters,
    onFiltersChange,
    sources,
    view,
    onViewChange,
    savedCount,
    sortMode,
    onSortChange,
    onRefresh,
    refreshDisabled,
    isRefreshing,
}) {
    const updateFilter = (key) => (value) => onFiltersChange({ ...filters, [key]: value });

    return (
        <section className={styles.controls} aria-label="新闻筛选">
            <div className={styles.primaryRow}>
                <div className={styles.segmented} role="group" aria-label="视图">
                    <button
                        type="button"
                        className={view === 'feed' ? styles.segmentActive : styles.segment}
                        aria-pressed={view === 'feed'}
                        onClick={() => onViewChange('feed')}
                    >
                        热点
                    </button>
                    <button
                        type="button"
                        className={view === 'saved' ? styles.segmentActive : styles.segment}
                        aria-pressed={view === 'saved'}
                        onClick={() => onViewChange('saved')}
                    >
                        收藏 {savedCount > 0 ? savedCount : ''}
                    </button>
                </div>

                <input
                    type="search"
                    className={styles.search}
                    placeholder="搜索标题"
                    aria-label="搜索标题"
                    value={filters.query}
                    onChange={(event) => updateFilter('query')(event.target.value)}
                />

                <button
                    type="button"
                    className={styles.refreshButton}
                    onClick={onRefresh}
                    disabled={refreshDisabled}
                >
                    {isRefreshing ? '刷新中…' : '刷新'}
                </button>
            </div>

            <div className={styles.filterRow}>
                <select
                    className={styles.select}
                    aria-label="排序方式"
                    value={sortMode}
                    onChange={(event) => onSortChange(event.target.value)}
                >
                    <option value="hot">按热度</option>
                    <option value="latest">按时间</option>
                </select>
                <FilterSelect label="全部地区" value={filters.region} options={REGIONS} onChange={updateFilter('region')} />
                <FilterSelect label="全部主题" value={filters.topic} options={TOPICS} onChange={updateFilter('topic')} />
                <FilterSelect label="全部来源" value={filters.source} options={sources} onChange={updateFilter('source')} />
                {hasActiveFilters(filters) && (
                    <button
                        type="button"
                        className={styles.clearButton}
                        onClick={() => onFiltersChange(DEFAULT_FILTERS)}
                    >
                        清除
                    </button>
                )}
            </div>
        </section>
    );
}
