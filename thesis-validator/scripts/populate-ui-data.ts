
import { fetch } from 'undici';
import { createHmac } from 'crypto';

const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';

const MOCK_USER = {
    id: 'dev-populator',
    email: 'populator@example.com',
    name: 'Populator Bot',
    role: 'admin',
    permissions: ['*']
};

function generateToken(user: any) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { ...user, iat: now, exp: now + 3600 };
    const base64url = (str: string) => Buffer.from(str).toString('base64url');
    const signature = createHmac('sha256', JWT_SECRET)
        .update(`${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`)
        .digest('base64url');
    return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.${signature}`;
}

async function main() {
    const token = generateToken(MOCK_USER);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log(`🚀 Populating UI Data at ${API_URL}`);

    // 1. Create Engagement
    console.log('\n[1/5] Creating Engagement...');
    const engRes = await fetch(`${API_URL}/engagements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: 'Stripe (Test Data)',
            target: { name: 'Stripe', sector: 'FinTech' },
            deal_type: 'growth',
            thesis_statement: 'Stripe is the payments infrastructure for the internet.'
        })
    });
    console.log(`Response Status: ${engRes.status}`);
    const engData = await engRes.json() as any;
    console.log('Response Body:', JSON.stringify(engData, null, 2));

    if (!engRes.ok) throw new Error(`Failed to create engagement: ${engRes.statusText}`);
    const engagementId = engData.id || engData.engagement?.id; // Attempt fallback
    console.log(`✅ Engagement Created: ${engagementId}`);

    // 2. Update Thesis with Value Drivers/Risks
    // Note: The /engagements updates don't always expose deep nesting updates easily in some APIs, 
    // but assuming standard update endpoint or we'll rely on the defaults if provided. 
    // Actually, let's try to simulate the thesis update if possible, or assume defaults.
    // The previous analysis showed investment_thesis.key_value_drivers.

    // Let's assume there's a way to update it, or we rely on the internal logic to populate it eventually.
    // For now, let's create Hypotheses which update the tree.

    // 3. Create Root Hypothesis (Thesis)
    console.log('\n[3/5] Creating Hypotheses...');
    const rootRes = await fetch(`${API_URL}/engagements/${engagementId}/hypotheses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            content: 'Stripe will process 50% of US ecommerce volume by 2030.',
            type: 'thesis',
            confidence: 0.85,
            importance: 'critical'
        })
    });
    console.log(`Response Status: ${rootRes.status}`);
    const rootData = await rootRes.json() as any;
    console.log('Response Body:', JSON.stringify(rootData, null, 2));

    if (!rootRes.ok) throw new Error(`Failed to create root thesis: ${rootRes.statusText}`);
    const rootId = rootData.id || rootData.hypothesis?.id || rootData.node?.id;
    console.log(`✅ Root Thesis Created: ${rootId}`);

    // 4. Create Sub-Hypotheses
    const h1Res = await fetch(`${API_URL}/engagements/${engagementId}/hypotheses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            content: 'International expansion in APAC is accelerating.',
            type: 'sub_thesis',
            parent_id: rootId,
            confidence: 0.70
        })
    });
    const h1Data = await h1Res.json() as any;
    const h1Id = h1Data.id || h1Data.hypothesis?.id;
    console.log(`✅ Sub-Hypothesis 1 Created: ${h1Id}`);

    // 5. Create Evidence
    console.log('\n[4/5] Creating Evidence...');
    await fetch(`${API_URL}/engagements/${engagementId}/evidence`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            content: 'Q4 earnings call mentions 200% growth in Japan.',
            sourceType: 'financial',
            sentiment: 'supporting',
            credibility: 0.95,
            hypothesisIds: [h1Id]
        })
    });

    await fetch(`${API_URL}/engagements/${engagementId}/evidence`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            content: 'Competitor Adyen winning enterprise deals in Australia.',
            sourceType: 'expert', // To trigger Expert Badge
            sourceTitle: 'Expert Call w/ Former Adyen VP',
            sentiment: 'contradicting',
            credibility: 0.80,
            hypothesisIds: [h1Id]
        })
    });
    console.log(`✅ Evidence Created.`);

    console.log('\n----------------------------------------');
    console.log(`🎉 Data Populated! Use Engagement ID: ${engagementId}`);
    console.log('----------------------------------------');
}

main().catch(console.error);
