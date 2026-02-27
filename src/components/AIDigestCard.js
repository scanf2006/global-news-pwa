'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './AIDigestCard.module.css';

export default function AIDigestCard() {
    const [digest, setDigest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const fetchDigest = async () => {
            try {
                // Get keys from local storage
                const localApiKey = localStorage.getItem('user_openai_api_key') || '';
                const localBaseUrl = localStorage.getItem('user_openai_base_url') || '';
                const localModel = localStorage.getItem('user_openai_model') || '';

                const headers = {};
                if (localApiKey) headers['x-user-openai-key'] = localApiKey;
                if (localBaseUrl) headers['x-user-openai-base'] = localBaseUrl;
                if (localModel) headers['x-user-openai-model'] = localModel;

                // Disable default caching mechanism if user configured custom settings to force real-time testing
                if (localApiKey) headers['cache-control'] = 'no-cache';

                const res = await fetch('/api/digest', { headers });
                const data = await res.json();
                if (data.success && data.data) {
                    setDigest(data.data);
                    setErrorMsg(null);
                } else {
                    setErrorMsg(data.error || '获取摘要失败，请检查您的 API Key 或网络设置。');
                }
            } catch (error) {
                console.error('Failed to fetch AI digest:', error);
                setErrorMsg('请求异常，无法连接到大模型服务器。');
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

    if (errorMsg) {
        return (
            <div className={`${styles.card} ${styles.mockVariant}`}>
                <div className={styles.header}>
                    <h2 className={styles.title} style={{ color: '#ef4444' }}>
                        <span className={styles.icon}>⚠️</span> 生成简报失败
                    </h2>
                </div>
                <div className={styles.content}>
                    <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: 0 }}>
                        {errorMsg}
                    </p>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                        请点击右上角 <span style={{ display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>⚙️</span> 检查您的 API 模型与密钥是否正确填写，或者余额是否充足。
                    </p>
                </div>
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
