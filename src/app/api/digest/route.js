import { NextResponse } from 'next/server';
import { NewsAggregator } from '@/services/newsAggregator';
import { APICache } from '@/lib/cache';

export async function GET(request) {
    try {
        // Retrieve custom keys from headers first
        const reqHeaders = new Headers(request.headers);
        const userApiKey = reqHeaders.get('x-user-openai-key');
        const userBaseUrl = reqHeaders.get('x-user-openai-base');
        const userModel = reqHeaders.get('x-user-openai-model');
        const skipCache = reqHeaders.get('cache-control') === 'no-cache';

        const apiKey = userApiKey || process.env.OPENAI_API_KEY;
        const baseUrl = userBaseUrl || process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
        const modelName = userModel || 'gpt-3.5-turbo';

        // 1. Check if we have a cached digest (cache for 4 hours to save tokens)
        // Differentiate cache key if the user provided their own API key, so they can test their own generations instantly
        const cacheKey = userApiKey ? `ai_digest_v1_custom_${userApiKey.slice(-4)}` : 'ai_digest_v1';

        if (!skipCache) {
            const cachedDigest = APICache.get(cacheKey);
            if (cachedDigest) {
                return NextResponse.json({ success: true, data: cachedDigest });
            }
        }

        // Graceful degradation if no API key is set
        if (!apiKey) {
            const fallbackData = {
                content: "### 🤖 AI 简报暂未开启\n\n系统检测到未配置大模型 API Key。您可以随时点击网页上方或环境变量中配置 `OPENAI_API_KEY` 来激活自动生成全球新闻摘要的超能力。\n\n*提示: 支持 OpenAI、DeepSeek 及其他兼容格式的模型。*",
                timestamp: new Date().toISOString(),
                isMock: true
            };
            return NextResponse.json({ success: true, data: fallbackData });
        }

        // 2. Fetch all news to summarize
        const allNews = await NewsAggregator.fetchAllNews();
        if (!allNews || allNews.length === 0) {
            return NextResponse.json({ success: false, error: 'No news available to summarize' }, { status: 404 });
        }

        // 3. Clean and isolate top news
        const topNewsBySource = {};
        allNews.forEach(item => {
            const source = item.source || 'Other';
            if (!topNewsBySource[source]) topNewsBySource[source] = [];
            if (topNewsBySource[source].length < 3) { // Only take top 3 from each
                topNewsBySource[source].push(item.titleTranslated || item.titleOriginal);
            }
        });

        // 4. Build Prompt
        let promptStr = "你是一个专业、客观的全球新闻编辑。请将以下按数据源分类的热点新闻，进行综合分析并总结成一份结构化的高质量早/晚报（建议篇幅在300-500字）。\n\n";
        promptStr += "要求：\n1. 结构清晰，可使用粗体和emoji。\n2. 提炼出跨平台被同时讨论的'焦点事件'，去重去闲聊。\n3. 直接输出Markdown格式正文，不要有任何多余的寒暄。\n\n新闻数据：\n";

        for (const [source, titles] of Object.entries(topNewsBySource)) {
            promptStr += `【${source}】\n- ${titles.join('\n- ')}\n\n`;
        }

        // 5. Call LLM API (OpenAI compatible)
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: 'system', content: 'You are an objective news editor.' },
                    { role: 'user', content: promptStr }
                ],
                temperature: 0.5
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('LLM API Error:', errText);
            return NextResponse.json({ success: false, error: 'LLM API failed' }, { status: 502 });
        }

        const completion = await response.json();
        let digestContent = completion.choices?.[0]?.message?.content || '生成简报失败。';
        const finishReason = completion.choices?.[0]?.finish_reason || 'unknown';

        if (finishReason !== 'stop' && finishReason !== 'unknown') {
            digestContent += `\n\n*(Debug: 摘要被意外截断。Finish Reason: ${finishReason})*`;
        }

        const digestData = {
            content: digestContent,
            timestamp: new Date().toISOString(),
            isMock: false
        };

        // Cache for 4 hours (14400 seconds)
        APICache.set(cacheKey, digestData, 14400);

        return NextResponse.json({ success: true, data: digestData });

    } catch (error) {
        console.error('Digest API Exception:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
