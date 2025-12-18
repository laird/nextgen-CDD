import { createHmac } from 'crypto';

const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';

// Mock user for token
const MOCK_USER = {
    id: 'dev-verifier',
    email: 'verifier@example.com',
    name: 'Verifier Bot',
    role: 'admin',
    permissions: ['*']
};

function generateToken(user: any) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { ...user, iat: now, exp: now + 3600 };

    const base64url = (str: string) => Buffer.from(str).toString('base64url');

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signature = createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64} `)
        .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature} `;
}

async function main() {
    // 1. Generate Token
    const token = generateToken(MOCK_USER);
    const headers = {
        'Authorization': `Bearer ${token} `,
        'Content-Type': 'application/json'
    };

    let engagementId = process.argv[2];

    if (!engagementId) {
        console.log('🔍 No Engagement ID provided. Fetching existing engagements...');
        const listRes = await fetch(`${API_URL}/engagements`, { headers });
        if (!listRes.ok) throw new Error(`Failed to list engagements: ${listRes.statusText}`);
        const listData = await listRes.json() as any;
        const engagements = listData.engagements || [];
        if (engagements.length === 0) {
            throw new Error('No engagements found in the system. Please create one first.');
        }
        engagementId = engagements[0].id;
        console.log(`👉 Selected latest engagement: ${engagementId} (${engagements[0].name})`);
    }

    console.log(`🔍 Verifying UI <-> Memory Integration for Engagement: ${engagementId}`);
    console.log(`🌐 API URL: ${API_URL}`);

    try {
        // 2. Fetch Engagement Details (Check Field Mapping)
        console.log('\n1️⃣  Checking Engagement Details (Field Mapping)...');
        const engRes = await fetch(`${API_URL}/engagements/${engagementId}`, { headers });
        if (!engRes.ok) throw new Error(`Failed to fetch engagement: ${engRes.statusText}`);
        const engData = await engRes.json() as any;

        const thesis = engData.engagement?.investment_thesis;
        console.log('   Thesis Object:', JSON.stringify(thesis, null, 2));

        if (thesis && thesis.key_value_drivers && Array.isArray(thesis.key_value_drivers)) {
            console.log('✅ "key_value_drivers" found and mapped correctly.');
            console.log('   Drivers:', thesis.key_value_drivers);
        } else {
            console.error('❌ "key_value_drivers" missing or invalid format.');
        }

        if (thesis && thesis.key_risks && Array.isArray(thesis.key_risks)) {
            console.log('✅ "key_risks" found and mapped correctly.');
        } else {
            console.error('❌ "key_risks" missing or invalid format.');
        }

        // 3. Fetch Hypothesis Tree (Check Graph Capabilities)
        console.log('\n2️⃣  Checking Hypothesis Tree (Graph Capabilities)...');
        const treeRes = await fetch(`${API_URL}/engagements/${engagementId}/hypothesis-tree`, { headers });
        if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.statusText}`);
        const treeData = await treeRes.json() as any;
        console.log("FULL TREE RESPONSE:", JSON.stringify(treeData, null, 2));

        const nodes = treeData.tree?.nodes || treeData.nodes || [];
        const edges = treeData.tree?.edges || treeData.edges || [];

        console.log(`   Nodes: ${nodes.length}`);
        console.log(`   Edges: ${edges.length}`);

        if (edges.length > 0) {
            console.log('✅ Causal Edges present in API response (Graph Active).');
            console.log('   Sample Edge:', edges[0]);
        } else {
            console.warn('⚠️  No Edges found. This might be correct if no relationships exist, but verify if Graph API is working.');
        }

        // 4. Fetch Evidence (Check Source Types)
        console.log('\n3️⃣  Checking Evidence (Source Types)...');
        const evRes = await fetch(`${API_URL}/engagements/${engagementId}/evidence`, { headers });
        if (!evRes.ok) throw new Error(`Failed to fetch evidence: ${evRes.statusText}`);
        const evData = await evRes.json() as any;
        const evidence = evData.evidence || [];

        console.log(`   Evidence Count: ${evidence.length}`);
        const expertEvidence = evidence.filter((e: any) => e.sourceType === 'expert');

        if (expertEvidence.length > 0) {
            console.log(`✅ Found ${expertEvidence.length} items from "expert" source (Expert Call Badge Compatible).`);
        } else {
            console.log('ℹ️  No expert evidence found.');
        }

        console.log('\n----------------------------------------');
        console.log('🎉 Verification Complete.');
        console.log('----------------------------------------');

    } catch (err) {
        console.error('❌ Verification Failed:', err);
        process.exit(1);
    }
}

main();
