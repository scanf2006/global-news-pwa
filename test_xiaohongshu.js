// 测试小红书适配器
const { XiaohongshuAdapter } = require('./xiaohongshuAdapter');

async function testXiaohongshu() {
    console.log('Testing Xiaohongshu Adapter...');
    try {
        const result = await XiaohongshuAdapter.fetchHotTopics();
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log('Total items:', result.length);
    } catch (error) {
        console.error('Error:', error);
    }
}

testXiaohongshu();
