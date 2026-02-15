// 测试知乎适配器本地运行
import { ZhihuAdapter } from './src/services/zhihuAdapter.js';

async function testZhihuAdapter() {
    console.log('Testing ZhihuAdapter locally...\n');

    try {
        const data = await ZhihuAdapter.fetchHotTopics();

        console.log('✅ Adapter works!');
        console.log('Total items:', data.length);
        console.log('\nItems:');
        data.forEach((item, i) => {
            console.log(`${i + 1}. [${item.source}] ${item.titleOriginal} - ${item.views}`);
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testZhihuAdapter();
