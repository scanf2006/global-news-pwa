import { selectChannelVideos } from './newsSources';
import { fetchFeed } from './rssAdapter';
import { isLikelyUsefulTitle } from './serviceUtils';

const VIDEOS_PER_CHANNEL = 2;
const NEWS_CHANNELS = {
    'BBC News': 'UC16niRr50-MSBwiO3YDb3RA',
    'DW News': 'UCknLrEdhRCp1aegoMqRaCZg',
    Reuters: 'UChqUTb7kYRX8-EiaN3XFrSQ',
    'France 24': 'UCQfwfsi5VrQ8yKZ-UWmAEFg',
    CNA: 'UC83jt4dlz1Gjl58fzQrrKZg',
    'CBC News': 'UCuFFtHWoLl5fauMMD5Ww2jA',
    'Global News': 'UChLtXXpo4Ge1ReTEboVvTDg',
    'The Guardian': 'UCHpw8xwDNhU9gdohEcJu4aA',
};

// YouTube 新闻频道适配器：使用公开频道 RSS，无需 API 密钥
export const YouTubeAdapter = {
    async fetchTrending() {
        const results = await Promise.allSettled(
            Object.entries(NEWS_CHANNELS).map(async ([channel, channelId]) => {
                const feed = await fetchFeed(
                    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
                );
                return { channel, videos: selectChannelVideos(feed.items, VIDEOS_PER_CHANNEL) };
            })
        );

        return results.flatMap((result) => {
            if (result.status === 'rejected') {
                console.warn('[YouTube] 频道抓取失败:', result.reason?.message);
                return [];
            }

            return result.value.videos
                .filter((video) => isLikelyUsefulTitle(video.title))
                .map((video) => {
                    const videoId = video.id.replace('yt:video:', '');
                    return {
                        id: `youtube-${videoId}`,
                        source: 'YouTube',
                        titleOriginal: video.title,
                        titleTranslated: null,
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        timestamp: video.isoDate || video.pubDate || null,
                        views: null,
                        thumbnail: null,
                    };
                });
        });
    },
};
