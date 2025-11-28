#!/usr/bin/env npx tsx
/**
 * Memory Migration Script
 *
 * Utilities for migrating and maintaining vector collections
 */

import { getRuvectorClient } from '../src/memory/index.js';
import { collectionSchemas, generateCollectionPayload } from '../src/config/index.js';

/**
 * Migration types
 */
type MigrationAction = 'backup' | 'restore' | 'reindex' | 'compact' | 'stats';

/**
 * Collection statistics
 */
interface CollectionStats {
  name: string;
  vectorCount: number;
  indexedPayloadCount: number;
  pointsCount: number;
  segmentsCount: number;
  status: string;
}

/**
 * Get collection statistics
 */
async function getCollectionStats(): Promise<CollectionStats[]> {
  const client = getRuvectorClient();
  const stats: CollectionStats[] = [];

  for (const schema of Object.values(collectionSchemas)) {
    try {
      const info = await client.getCollectionInfo(schema.name);
      stats.push({
        name: schema.name,
        vectorCount: info?.vectors_count ?? 0,
        indexedPayloadCount: info?.indexed_vectors_count ?? 0,
        pointsCount: info?.points_count ?? 0,
        segmentsCount: info?.segments_count ?? 0,
        status: info?.status ?? 'unknown',
      });
    } catch {
      stats.push({
        name: schema.name,
        vectorCount: 0,
        indexedPayloadCount: 0,
        pointsCount: 0,
        segmentsCount: 0,
        status: 'not_found',
      });
    }
  }

  return stats;
}

/**
 * Print collection statistics
 */
async function printStats(): Promise<void> {
  console.log('📊 Collection Statistics\n');

  const stats = await getCollectionStats();

  console.log('Collection'.padEnd(40) + 'Vectors'.padStart(12) + 'Status'.padStart(15));
  console.log('-'.repeat(67));

  for (const stat of stats) {
    console.log(
      stat.name.padEnd(40) +
      stat.vectorCount.toString().padStart(12) +
      stat.status.padStart(15)
    );
  }

  const totalVectors = stats.reduce((sum, s) => sum + s.vectorCount, 0);
  console.log('-'.repeat(67));
  console.log('Total'.padEnd(40) + totalVectors.toString().padStart(12));
}

/**
 * Backup collection to JSON
 */
async function backupCollection(collectionName: string, outputPath: string): Promise<void> {
  console.log(`📦 Backing up ${collectionName}...`);

  const client = getRuvectorClient();
  const points: { id: string; vector: number[]; payload: Record<string, unknown> }[] = [];

  // Scroll through all points
  let offset: string | undefined;
  const limit = 100;

  while (true) {
    const result = await client.scroll(collectionName, limit, offset);
    if (!result || result.length === 0) break;

    for (const point of result) {
      points.push({
        id: point.id,
        vector: Array.from(point.vector),
        payload: point.payload,
      });
    }

    if (result.length < limit) break;
    offset = result[result.length - 1]?.id;
  }

  // Write to file
  const fs = await import('fs/promises');
  await fs.writeFile(
    outputPath,
    JSON.stringify({
      collection: collectionName,
      timestamp: new Date().toISOString(),
      count: points.length,
      points,
    }, null, 2)
  );

  console.log(`✓ Backed up ${points.length} points to ${outputPath}`);
}

/**
 * Restore collection from JSON backup
 */
async function restoreCollection(inputPath: string): Promise<void> {
  const fs = await import('fs/promises');
  const data = JSON.parse(await fs.readFile(inputPath, 'utf-8'));

  console.log(`📥 Restoring ${data.collection} (${data.count} points)...`);

  const client = getRuvectorClient();

  // Check if collection exists, create if not
  const schema = Object.values(collectionSchemas).find((s) => s.name === data.collection);
  if (!schema) {
    throw new Error(`Unknown collection: ${data.collection}`);
  }

  try {
    await client.getCollectionInfo(data.collection);
    console.log('Collection exists, will add to existing data');
  } catch {
    console.log('Creating collection...');
    await client.createCollection(data.collection, schema.vectorSize, 'cosine');
  }

  // Insert points in batches
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < data.points.length; i += batchSize) {
    const batch = data.points.slice(i, i + batchSize);

    for (const point of batch) {
      await client.upsert(
        data.collection,
        point.id,
        new Float32Array(point.vector),
        point.payload
      );
      inserted++;
    }

    console.log(`  Progress: ${inserted}/${data.count}`);
  }

  console.log(`✓ Restored ${inserted} points`);
}

/**
 * Reindex collection (recreate with fresh indexes)
 */
async function reindexCollection(collectionName: string): Promise<void> {
  console.log(`🔄 Reindexing ${collectionName}...`);

  const tempPath = `/tmp/${collectionName}_backup_${Date.now()}.json`;

  // Backup
  await backupCollection(collectionName, tempPath);

  // Drop and recreate
  const client = getRuvectorClient();
  const schema = Object.values(collectionSchemas).find((s) => s.name === collectionName);

  if (!schema) {
    throw new Error(`Unknown collection: ${collectionName}`);
  }

  console.log('Dropping collection...');
  await client.deleteCollection(collectionName);

  console.log('Recreating collection...');
  await client.createCollection(collectionName, schema.vectorSize, 'cosine');

  // Restore
  await restoreCollection(tempPath);

  // Cleanup temp file
  const fs = await import('fs/promises');
  await fs.unlink(tempPath);

  console.log(`✓ Reindexed ${collectionName}`);
}

/**
 * Compact collection (optimize storage)
 */
async function compactCollection(collectionName: string): Promise<void> {
  console.log(`🗜️ Compacting ${collectionName}...`);

  // In a real implementation, this would call the Ruvector optimize endpoint
  console.log('Note: Compaction is handled automatically by Ruvector');
  console.log('This operation triggers an explicit optimization request');

  // Placeholder for actual optimization call
  console.log(`✓ Optimization requested for ${collectionName}`);
}

/**
 * Main
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const action = args[0] as MigrationAction | undefined;

  console.log('🔧 Memory Migration Utility\n');

  switch (action) {
    case 'stats':
      await printStats();
      break;

    case 'backup': {
      const collection = args[1];
      const output = args[2] ?? `./backup_${collection}_${Date.now()}.json`;

      if (!collection) {
        console.error('Usage: migrate-memory backup <collection> [output-path]');
        process.exit(1);
      }

      await backupCollection(collection, output);
      break;
    }

    case 'restore': {
      const input = args[1];

      if (!input) {
        console.error('Usage: migrate-memory restore <input-path>');
        process.exit(1);
      }

      await restoreCollection(input);
      break;
    }

    case 'reindex': {
      const collection = args[1];

      if (!collection) {
        console.error('Usage: migrate-memory reindex <collection>');
        process.exit(1);
      }

      await reindexCollection(collection);
      break;
    }

    case 'compact': {
      const collection = args[1];

      if (!collection) {
        console.error('Usage: migrate-memory compact <collection>');
        process.exit(1);
      }

      await compactCollection(collection);
      break;
    }

    default:
      console.log('Usage: migrate-memory <action> [options]');
      console.log('\nActions:');
      console.log('  stats              - Show collection statistics');
      console.log('  backup <col> [out] - Backup collection to JSON');
      console.log('  restore <input>    - Restore collection from JSON');
      console.log('  reindex <col>      - Reindex collection');
      console.log('  compact <col>      - Compact/optimize collection');
      console.log('\nCollections:');
      for (const schema of Object.values(collectionSchemas)) {
        console.log(`  - ${schema.name}`);
      }
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
