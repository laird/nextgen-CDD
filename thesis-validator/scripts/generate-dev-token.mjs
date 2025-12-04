#!/usr/bin/env node
/**
 * Generate a development JWT token for testing
 * Usage: node scripts/generate-dev-token.mjs
 */

import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const secret = process.env.JWT_SECRET || 'development-secret-change-in-production';

const fastify = Fastify({ logger: false });
await fastify.register(jwt, { secret });

const payload = {
  id: 'dev-user-1',
  email: 'developer@example.com',
  name: 'Development User',
  role: 'admin',
  permissions: ['read', 'write', 'admin'],
};

const token = fastify.jwt.sign(payload, { expiresIn: '24h' });

console.log('\n📋 Development JWT Token (valid for 24h):');
console.log('\n' + token);
console.log('\n💡 Usage:');
console.log(`\nexport AUTH_TOKEN="${token}"`);
console.log('cd tui-client && npm run dev');
console.log('\nOr test with curl:');
console.log(`\ncurl -H "Authorization: Bearer ${token}" http://localhost:3000/api/v1/engagements\n`);

await fastify.close();
