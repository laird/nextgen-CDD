import 'dotenv/config';
import { getLLMProviderConfig, LLMProvider } from './src/services/llm-provider.js';

async function main() {
  console.log('Testing LLM Provider Configuration...\n');

  // Check env vars
  console.log('Environment Variables:');
  console.log('  LLM_PROVIDER:', JSON.stringify(process.env.LLM_PROVIDER));
  console.log('  GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);
  console.log('  GOOGLE_CLOUD_REGION:', process.env.GOOGLE_CLOUD_REGION);
  console.log('  VERTEX_AI_MODEL:', process.env.VERTEX_AI_MODEL);
  console.log('');

  // Get config
  const config = getLLMProviderConfig();
  console.log('Resolved Config:');
  console.log('  provider:', config.provider);
  console.log('  model:', config.model);
  console.log('  projectId:', config.projectId);
  console.log('  region:', config.region);
  console.log('');

  // Create provider
  console.log('Creating LLM Provider...');
  const provider = new LLMProvider(config);
  console.log('  Provider type:', provider.getProviderType());

  // Initialize
  console.log('\nInitializing provider...');
  try {
    await provider.initialize();
    console.log('  Provider initialized successfully!');
    console.log('  Ready:', provider.isReady());
  } catch (err: unknown) {
    const error = err as Error;
    console.error('  Error initializing provider:', error.message);
    console.error('  Stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

main();
