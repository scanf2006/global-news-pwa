// 测试今日热榜 - B站热搜API
async function testBilibiliAPI() {
    console.log('Testing Bilibili Hot Search API...\n');

    try {
        const url = 'https://api.vvhan.com/api/hotlist?type=bilibili';
        const response = await fetch(url);

        console.log('Status:', response.status);

        const data = await response.json();
        console.log('Success:', data.success);
        console.log('Title:', data.title);

        if (data.success && data.data) {
            console.log('\n✅ API Success!');
            console.log('Total items:', data.data.length);
            console.log('\nFirst 5 items:');
            data.data.slice(0, 5).forEach((item, i) => {
                console.log(`${i + 1}. ${item.title} - 热度: ${item.hot || 'N/A'}`);
            });

            console.log('\n\nFirst item structure:');
            console.log(JSON.stringify(data.data[0], null, 2));
        } else {
            console.log('❌ API Error');
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testBilibiliAPI();
