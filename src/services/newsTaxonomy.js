export const REGIONS = ['全球', '加拿大', '多伦多', '中国'];
export const TOPICS = ['时政', '财经', '科技', '体育', '娱乐', '社会', '其他'];

const TORONTO_SOURCES = new Set(['CBC Toronto', 'Global News', 'Toronto Star', 'CP24', 'CityNews Toronto']);
const CANADA_SOURCES = new Set(['Globe and Mail']);
const CHINA_SOURCES = new Set(['微博热搜', 'IT之家']);
// 标题没有命中关键词时，专业媒体使用其默认主题
const SOURCE_TOPICS = { 'IT之家': '科技', 'The Verge': '科技', 'Hacker News': '科技', CNBC: '财经' };

// 按优先级匹配，英文关键词使用完整单词
const TOPIC_KEYWORDS = [
    ['体育', ['nba', 'nfl', 'nhl', 'mlb', 'fifa', 'soccer', 'football', 'basketball', 'hockey', 'tennis', 'olympic', 'olympics', 'playoffs', 'lakers', 'raptors', 'leafs', '比赛', '足球', '篮球', '网球', '冠军', '联赛', '奥运', '球队', '球员']],
    ['科技', ['ai', 'openai', 'google', 'apple', 'iphone', 'microsoft', 'nvidia', 'tesla', 'chip', 'chips', 'software', 'cyber', 'robot', 'spacex', 'nasa', '人工智能', '芯片', '科技', '手机', '软件', '机器人', '航天', '网络攻击']],
    ['财经', ['economy', 'economic', 'market', 'markets', 'stocks', 'inflation', 'tariff', 'tariffs', 'bank', 'trade', 'oil', 'prices', 'budget', 'housing', '经济', '股市', '通胀', '关税', '银行', '油价', '贸易', '房价', '预算', '财报']],
    ['娱乐', ['movie', 'film', 'music', 'album', 'celebrity', 'actor', 'actress', 'singer', 'netflix', 'hollywood', 'oscars', 'grammy', 'trailer', '电影', '明星', '演员', '歌手', '综艺', '电视剧', '票房', '演唱会']],
    ['时政', ['president', 'minister', 'government', 'election', 'parliament', 'congress', 'senate', 'trump', 'putin', 'carney', 'war', 'ukraine', 'russia', 'israel', 'gaza', 'iran', 'nato', 'military', 'diplomat', '总统', '总理', '政府', '选举', '议会', '国会', '战争', '外交', '军事', '乌克兰', '俄罗斯', '以色列', '伊朗', '加沙', '特朗普']],
    ['社会', ['police', 'crime', 'shooting', 'stabbing', 'fire', 'crash', 'court', 'killed', 'dead', 'death', 'storm', 'weather', 'hospital', 'school', 'transit', '警方', '枪击', '火灾', '车祸', '法院', '死亡', '遇难', '天气', '医院', '学校', '事故']],
];

export function getRegion(source) {
    if (TORONTO_SOURCES.has(source)) {
        return '多伦多';
    }
    if (CANADA_SOURCES.has(source)) {
        return '加拿大';
    }
    return CHINA_SOURCES.has(source) ? '中国' : '全球';
}

// 多伦多来源同时归入加拿大筛选
export function getRegions(source) {
    const region = getRegion(source);
    return region === '多伦多' ? ['多伦多', '加拿大'] : [region];
}

export function classifyItemTopic(item) {
    const topic = classifyTopic(item.titleOriginal, item.titleTranslated);
    if (topic !== '其他') {
        return topic;
    }

    const sources = item.sourceList || [item.source];
    return sources.map((source) => SOURCE_TOPICS[source]).find(Boolean) || topic;
}

export function classifyTopic(...titles) {
    const text = titles.filter(Boolean).join(' ').toLowerCase();
    const words = new Set(text.match(/[a-z0-9]+/g) || []);

    for (const [topic, keywords] of TOPIC_KEYWORDS) {
        const matched = keywords.some((keyword) =>
            /^[a-z0-9]+$/.test(keyword) ? words.has(keyword) : text.includes(keyword)
        );
        if (matched) {
            return topic;
        }
    }

    return '其他';
}
