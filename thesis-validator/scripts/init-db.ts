#!/usr/bin/env npx tsx
/**
 * Initialize Database Script
 *
 * Creates Ruvector collections and indexes for Thesis Validator
 */

import {
  collectionSchemas,
  generateCollectionPayload,
  ruvectorClientConfig,
} from '../src/config/index.js';

/**
 * Initialize all collections
 */
async function initializeCollections(): Promise<void> {
  console.log('🚀 Initializing Thesis Validator database...\n');

  const baseUrl = `${ruvectorClientConfig.useTls ? 'https' : 'http'}://${ruvectorClientConfig.host}:${ruvectorClientConfig.port}`;

  console.log(`Connecting to Ruvector at ${baseUrl}\n`);

  for (const [key, schema] of Object.entries(collectionSchemas)) {
    console.log(`Creating collection: ${schema.name}`);

    try {
      // Check if collection exists
      const checkResponse = await fetch(`${baseUrl}/collections/${schema.name}`, {
        method: 'GET',
        headers: ruvectorClientConfig.apiKey
          ? { 'api-key': ruvectorClientConfig.apiKey }
          : {},
      });

      if (checkResponse.ok) {
        console.log(`  ✓ Collection ${schema.name} already exists`);
        continue;
      }

      // Create collection
      const payload = generateCollectionPayload(schema);
      const createResponse = await fetch(`${baseUrl}/collections/${schema.name}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(ruvectorClientConfig.apiKey ? { 'api-key': ruvectorClientConfig.apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Failed to create collection: ${error}`);
      }

      console.log(`  ✓ Created collection ${schema.name}`);

      // Create indexes
      for (const index of schema.indexes) {
        console.log(`  Creating index on ${index.field}...`);

        const indexResponse = await fetch(
          `${baseUrl}/collections/${schema.name}/index`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(ruvectorClientConfig.apiKey ? { 'api-key': ruvectorClientConfig.apiKey } : {}),
            },
            body: JSON.stringify({
              field_name: index.field,
              field_schema: index.type,
            }),
          }
        );

        if (!indexResponse.ok) {
          console.log(`    ⚠ Warning: Could not create index on ${index.field}`);
        } else {
          console.log(`    ✓ Created index on ${index.field}`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Error creating collection ${schema.name}:`, error);
    }
  }

  console.log('\n✅ Database initialization complete');
}

/**
 * Drop all collections (use with caution!)
 */
async function dropCollections(): Promise<void> {
  console.log('⚠️  Dropping all collections...\n');

  const baseUrl = `${ruvectorClientConfig.useTls ? 'https' : 'http'}://${ruvectorClientConfig.host}:${ruvectorClientConfig.port}`;

  for (const schema of Object.values(collectionSchemas)) {
    try {
      const response = await fetch(`${baseUrl}/collections/${schema.name}`, {
        method: 'DELETE',
        headers: ruvectorClientConfig.apiKey
          ? { 'api-key': ruvectorClientConfig.apiKey }
          : {},
      });

      if (response.ok) {
        console.log(`  ✓ Dropped collection ${schema.name}`);
      } else {
        console.log(`  - Collection ${schema.name} does not exist`);
      }
    } catch (error) {
      console.error(`  ✗ Error dropping collection ${schema.name}:`, error);
    }
  }

  console.log('\n✅ All collections dropped');
}

/**
 * Main
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--drop')) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('⚠️  This will DELETE all data. Are you sure? (yes/no): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'yes') {
      await dropCollections();
    } else {
      console.log('Aborted.');
      return;
    }
  }

  await initializeCollections();
}

main().catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});
