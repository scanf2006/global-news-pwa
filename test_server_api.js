// 测试小红书API在服务器端的调用
async function testServerSideAPI() {
    console.log('Testing Xiaohongshu API from server side...\n');

    // 模拟服务器环境变量
    const apiKey = 'zFaBZRobN38IyUqOFmgolfWMRS';

    if (!apiKey) {
        console.log('❌ API Key not found in environment');
        return;
    }

    console.log('✅ API Key found:', apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4));

    try {
        const url = `https://api.itapi.cn/api/hotnews/xiaohongshu?key=${apiKey}`;
        console.log('Fetching from:', url.replace(apiKey, 'YOUR_KEY'));

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        console.log('Response status:', response.status);

        const data = await response.json();
        console.log('Response code:', data.code);
        console.log('Response message:', data.msg);

        if (data.code === 200 && data.data) {
            console.log('\n✅ API Call Successful!');
            console.log('Total items:', data.data.length);
            console.log('\nFirst 5 items:');
            data.data.slice(0, 5).forEach((item, i) => {
                console.log(`${i + 1}. ${item.name} - ${item.viewnum}`);
            });
        } else {
            console.log('\n❌ API returned error');
            console.log('Full response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

testServerSideAPI();
