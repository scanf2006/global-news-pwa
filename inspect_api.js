// 查看完整 API 响应结构的调试脚本
async function inspectAPIResponse() {
    const apiKey = process.env.XIAOHONGSHU_API_KEY || '';
    if (!apiKey) {
        console.error('未配置环境变量 XIAOHONGSHU_API_KEY，请配置后再运行此脚本。');
        return;
    }

    const url = `https://api.itapi.cn/api/hotnews/xiaohongshu?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log('完整 API 响应:');
        console.log(JSON.stringify(data, null, 2));

        if (data.data && data.data[0]) {
            console.log('\n\n首条数据结构:');
            console.log('字段列表:', Object.keys(data.data[0]));
            console.log('示例数据:', data.data[0]);
        }
    } catch (error) {
        console.error('请求出错:', error);
    }
}

inspectAPIResponse();
