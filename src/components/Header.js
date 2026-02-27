'use client';

import { useState, useEffect } from 'react';
import styles from './Header.module.css';

export default function Header() {
    const [showSettings, setShowSettings] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [model, setModel] = useState('');

    useEffect(() => {
        // Load existing settings on mount
        setApiKey(localStorage.getItem('user_openai_api_key') || '');
        setBaseUrl(localStorage.getItem('user_openai_base_url') || '');
        setModel(localStorage.getItem('user_openai_model') || '');
    }, []);

    const handleSave = () => {
        if (apiKey) localStorage.setItem('user_openai_api_key', apiKey.trim());
        else localStorage.removeItem('user_openai_api_key');

        if (baseUrl) localStorage.setItem('user_openai_base_url', baseUrl.trim());
        else localStorage.removeItem('user_openai_base_url');

        if (model) localStorage.setItem('user_openai_model', model.trim());
        else localStorage.removeItem('user_openai_model');

        setShowSettings(false);
        // Force reload to apply changes globally
        window.location.reload();
    };

    return (
        <div className={styles.headerContainer}>
            <div className={styles.headerGlass}>
                <div className={styles.topRow}>
                    <h1 className={styles.title}>
                        🌐 全球热点
                    </h1>
                    <button
                        className={styles.settingsBtn}
                        onClick={() => setShowSettings(true)}
                        title="AI 简报设置"
                    >
                        ⚙️
                    </button>
                </div>
                <p className={styles.subtitle}>
                    汇聚全球主要媒体实时资讯
                </p>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className={styles.modalOverlay} onClick={() => setShowSettings(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>✨ AI 简报设置</h3>
                            <button className={styles.closeBtn} onClick={() => setShowSettings(false)}>×</button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.inputGroup}>
                                <label>API Key (必填)</label>
                                <input
                                    type="password"
                                    placeholder="sk-..."
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                                <small>支持 OpenAI、DeepSeek、SiliconFlow 等兼容格式及平台。</small>
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Base URL (选填)</label>
                                <input
                                    type="text"
                                    placeholder="例如: https://api.deepseek.com/v1"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                />
                                <small>如果不填，默认使用 OpenAI 官方接口。</small>
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Model (模型名称, 选填)</label>
                                <input
                                    type="text"
                                    placeholder="例如: deepseek-chat 或 Qwen/Qwen2.5-7B-Instruct"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                />
                                <small>如果不填，默认使用 gpt-3.5-turbo。</small>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.saveBtn} onClick={handleSave}>保存并生效</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
