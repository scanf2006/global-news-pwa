'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './AIDigestCard.module.css';

export default function AIDigestCard() {
    const [digest, setDigest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const fetchDigest = async () => {
            try {
                // Get keys from local storage
                const localApiKey = localStorage.getItem('user_openai_api_key') || '';
                const localBaseUrl = localStorage.getItem('user_openai_base_url') || '';

                const headers = {};
                if (localApiKey) headers['x-user-openai-key'] = localApiKey;
                if (localBaseUrl) headers['x-user-openai-base'] = localBaseUrl;

                const res = await fetch('/api/digest', { headers });
                const data = await res.json();
                if (data.success && data.data) {
                    setDigest(data.data);
                }
            } catch (error) {
                console.error('Failed to fetch AI digest:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDigest();
    }, []);

    if (loading) {
        return (
            <div className={`${styles.card} ${styles.skeletonCard}`}>
                <div className={styles.skeletonTitle}></div>
                <div className={styles.skeletonLine}></div>
                <div className={styles.skeletonLine}></div>
                <div className={styles.skeletonLine} style={{ width: '80%' }}></div>
            </div>
        );
    }

    if (!digest) return null;

    const formattedTime = new Date(digest.timestamp).toLocaleString('zh-CN', {
        hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric'
    });

    return (
        <div className={`${styles.card} ${digest.isMock ? styles.mockVariant : ''}`}>
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <span className={styles.icon}>✨</span> AI 全球速报
                </h2>
                <span className={styles.time}>{formattedTime}更新</span>
            </div>

            <div className={`${styles.content} ${!isExpanded ? styles.collapsed : ''}`}>
                <ReactMarkdown>{digest.content}</ReactMarkdown>
            </div>

            <button
                className={styles.expandButton}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {isExpanded ? '收起简报 ⌃' : '展开全文 ⌄'}
            </button>
        </div>
    );
}
