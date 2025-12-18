
import 'dotenv/config';
import { WebSearchService } from '../src/tools/web-search.js';

async function testTavily() {
    const service = new WebSearchService();
    console.log('Testing Tavily search...');

    try {
        const result = await service.search('Tesla stock news', {
            maxResults: 1,
            searchDepth: 'basic',
            topic: 'general'
        });
        console.log('Success:', result);
    } catch (error) {
        console.error('Failure:', error);
    }
}

testTavily();
