'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="zh-CN">
            <body style={{ margin: 0, fontFamily: 'Segoe UI, sans-serif', background: '#dbeafe', color: '#0f172a' }}>
                <main
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem',
                    }}
                >
                    <section
                        style={{
                            maxWidth: '480px',
                            width: '100%',
                            background: 'rgba(255,255,255,0.72)',
                            border: '1px solid rgba(255,255,255,0.8)',
                            borderRadius: '20px',
                            padding: '2rem',
                            boxShadow: '0 24px 48px rgba(30, 64, 175, 0.12)',
                            backdropFilter: 'blur(18px)',
                        }}
                    >
                        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>页面发生错误</h1>
                        <p style={{ margin: '0.75rem 0 1.5rem', lineHeight: 1.6, color: '#334155' }}>
                            刚刚这次渲染没有成功。你可以重试一次，通常临时数据源异常刷新后就会恢复。
                        </p>
                        <button
                            onClick={() => reset()}
                            style={{
                                border: 'none',
                                borderRadius: '999px',
                                background: '#2563eb',
                                color: '#fff',
                                padding: '0.75rem 1.25rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            重新加载
                        </button>
                    </section>
                </main>
            </body>
        </html>
    );
}
