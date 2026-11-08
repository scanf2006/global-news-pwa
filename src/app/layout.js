import './globals.css';

// 全局页面元数据配置
export const metadata = {
    title: 'Global News PWA',
    description: '实时全球热点新闻聚合与智能中文翻译',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'Global News',
    },
    formatDetection: {
        telephone: false,
    },
};

// 视口与主题色配置（允许用户自由缩放以提升无障碍体验）
export const viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#eef6ff',
};

export default function RootLayout({ children }) {
    return (
        <html lang="zh-CN">
            <head>
                <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
            </head>
            <body>{children}</body>
        </html>
    );
}
