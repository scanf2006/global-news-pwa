// 测试不同的知乎API端点
async function testZhihuEndpoints() {
    const apiKey = 'zFaBZRobN38IyUqOFmgolfWMRS';

    const endpoints = [
        'https://api.itapi.cn/api/hotnews/zhihu',
        'https://api.itapi.cn/api/zhihu/hot',
        'https://api.itapi.cn/api/hot/zhihu'
    ];

    for (const endpoint of endpoints) {
        console.log(`\nTesting: ${endpoint}`);
        try {
            const url = `${endpoint}?key=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            console.log('Status:', response.status);
            console.log('Code:', data.code);
            console.log('Message:', data.msg);

            if (data.code === 200) {
                console.log('✅ SUCCESS! This endpoint works!');
                console.log('Data count:', data.data?.length);
                break;
            }
        } catch (error) {
            console.log('Error:', error.message);
        }
    }
}

testZhihuEndpoints();
