// 测试顺为数据知乎API
async function testZhihuAPI() {
    const apiKey = 'zFaBZRobN38IyUqOFmgolfWMRS';
    const url = `https://api.itapi.cn/api/hotnews/zhihu?key=${apiKey}`;

    console.log('Testing Zhihu API...\n');

    try {
        const response = await fetch(url);
        console.log('Status:', response.status);

        const data = await response.json();
        console.log('Response code:', data.code);
        console.log('Message:', data.msg);

        if (data.code === 200 && data.data) {
            console.log('\n✅ API Success!');
            console.log('Total items:', data.data.length);
            console.log('\nFirst 5 items:');
            data.data.slice(0, 5).forEach((item, i) => {
                console.log(`${i + 1}. ${item.title || item.name} - 热度: ${item.hot || item.viewnum || 'N/A'}`);
            });

            console.log('\n\nFirst item structure:');
            console.log('Keys:', Object.keys(data.data[0]));
            console.log('Sample:', JSON.stringify(data.data[0], null, 2));
        } else {
            console.log('❌ API Error');
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testZhihuAPI();
