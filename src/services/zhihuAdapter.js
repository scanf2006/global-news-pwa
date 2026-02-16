export const ZhihuAdapter = {
    async fetchHotTopics() {
        try {
            const response = await fetch("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=10");
            const data = await response.json();

            if (data.data) {
                const hotTopics = data.data;
                const top10 = hotTopics.slice(0, 10);

                return top10.map((item, index) => ({
                    id: "zhihu-" + item.target.id + "-" + Date.now(),
                    title: item.target.title,
                    url: "https://www.zhihu.com/question/" + item.target.id,
                    source: "Zhihu Hot",
                    rank: index + 1,
                    views: item.detail_text || 0
                }));
            }

            return [];
        } catch (error) {
            console.error("Failed to fetch Zhihu hot topics:", error);
            return [];
        }
    }
};
