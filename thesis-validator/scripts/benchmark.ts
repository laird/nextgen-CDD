#!/usr/bin/env npx tsx
/**
 * Benchmark Script
 *
 * Performance benchmarks for Thesis Validator components
 */

import { generateEmbedding, generateEmbeddings } from '../src/tools/index.js';
import { getRuvectorClient } from '../src/memory/index.js';

/**
 * Benchmark result
 */
interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSecond: number;
}

/**
 * Run a benchmark
 */
async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 10
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  await fn();

  // Actual runs
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const opsPerSecond = 1000 / avgMs;

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSecond,
  };
}

/**
 * Print benchmark result
 */
function printResult(result: BenchmarkResult): void {
  console.log(`\n📊 ${result.name}`);
  console.log(`   Iterations: ${result.iterations}`);
  console.log(`   Average: ${result.avgMs.toFixed(2)}ms`);
  console.log(`   Min: ${result.minMs.toFixed(2)}ms`);
  console.log(`   Max: ${result.maxMs.toFixed(2)}ms`);
  console.log(`   Ops/sec: ${result.opsPerSecond.toFixed(2)}`);
}

/**
 * Embedding benchmarks
 */
async function benchmarkEmbeddings(): Promise<void> {
  console.log('\n🔤 Embedding Benchmarks\n' + '='.repeat(40));

  // Single embedding
  const singleResult = await runBenchmark(
    'Single Embedding (short text)',
    async () => {
      await generateEmbedding('The quick brown fox jumps over the lazy dog.');
    },
    5
  );
  printResult(singleResult);

  // Single embedding (long text)
  const longText = `
    Investment thesis for TechCorp acquisition: The company has demonstrated strong
    market position in the enterprise software space with 40% year-over-year growth.
    Key value creation levers include international expansion, product line extension,
    and operational efficiency improvements. Main risks include competitive pressure
    from larger players and potential regulatory changes in key markets.
  `;
  const longResult = await runBenchmark(
    'Single Embedding (long text)',
    async () => {
      await generateEmbedding(longText);
    },
    5
  );
  printResult(longResult);

  // Batch embeddings
  const batchTexts = Array(10).fill('Sample text for embedding benchmark');
  const batchResult = await runBenchmark(
    'Batch Embeddings (10 texts)',
    async () => {
      await generateEmbeddings(batchTexts);
    },
    3
  );
  printResult(batchResult);
}

/**
 * Vector search benchmarks
 */
async function benchmarkVectorSearch(): Promise<void> {
  console.log('\n🔍 Vector Search Benchmarks\n' + '='.repeat(40));

  const client = getRuvectorClient();
  const collectionName = 'benchmark_test';

  // Setup: Create collection and insert vectors
  console.log('Setting up test collection...');

  try {
    await client.createCollection(collectionName, 1536, 'cosine');

    // Insert test vectors
    const testVectors: { id: string; vector: Float32Array; payload: Record<string, unknown> }[] = [];
    for (let i = 0; i < 1000; i++) {
      const vector = new Float32Array(1536);
      for (let j = 0; j < 1536; j++) {
        vector[j] = Math.random();
      }
      testVectors.push({
        id: `test_${i}`,
        vector,
        payload: { index: i, category: i % 10 },
      });
    }

    // Batch insert
    const insertResult = await runBenchmark(
      'Batch Insert (1000 vectors)',
      async () => {
        for (let i = 0; i < testVectors.length; i += 100) {
          const batch = testVectors.slice(i, i + 100);
          for (const item of batch) {
            await client.upsert(collectionName, item.id, item.vector, item.payload);
          }
        }
      },
      1
    );
    printResult(insertResult);

    // Search benchmark
    const queryVector = new Float32Array(1536);
    for (let i = 0; i < 1536; i++) {
      queryVector[i] = Math.random();
    }

    const searchResult = await runBenchmark(
      'Vector Search (top 10)',
      async () => {
        await client.search(collectionName, queryVector, 10);
      },
      10
    );
    printResult(searchResult);

    // Filtered search
    const filteredResult = await runBenchmark(
      'Filtered Vector Search (top 10)',
      async () => {
        await client.search(collectionName, queryVector, 10, { category: 5 });
      },
      10
    );
    printResult(filteredResult);

    // Cleanup
    await client.deleteCollection(collectionName);
    console.log('\nTest collection cleaned up.');
  } catch (error) {
    console.log('Vector search benchmarks skipped (Ruvector not available)');
  }
}

/**
 * Memory benchmarks
 */
async function benchmarkMemory(): Promise<void> {
  console.log('\n💾 Memory Benchmarks\n' + '='.repeat(40));

  const initialMemory = process.memoryUsage();

  // Create large data structures
  const data: unknown[] = [];
  for (let i = 0; i < 10000; i++) {
    data.push({
      id: `item_${i}`,
      content: 'x'.repeat(1000),
      metadata: { index: i, timestamp: Date.now() },
    });
  }

  const afterAllocation = process.memoryUsage();

  console.log('\n📊 Memory Usage');
  console.log(`   Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   After 10k items: ${(afterAllocation.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Increase: ${((afterAllocation.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Per item: ${((afterAllocation.heapUsed - initialMemory.heapUsed) / 10000).toFixed(2)} bytes`);
}

/**
 * Main
 */
async function main(): Promise<void> {
  console.log('🚀 Thesis Validator Benchmarks\n');
  console.log('='.repeat(50));

  const args = process.argv.slice(2);

  if (args.includes('--embeddings') || args.length === 0) {
    await benchmarkEmbeddings();
  }

  if (args.includes('--vector') || args.length === 0) {
    await benchmarkVectorSearch();
  }

  if (args.includes('--memory') || args.length === 0) {
    await benchmarkMemory();
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Benchmarks complete');
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
