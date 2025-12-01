/**
 * Configuration Exports
 */

export { defaultConfig, type Config } from './default.js';
export { getProductionConfig, productionConfig } from './production.js';
export {
  collectionSchemas,
  getCollectionSchema,
  generateCollectionPayload,
  ruvectorClientConfig,
  type CollectionSchema,
  type PayloadFieldConfig,
  type IndexConfig,
} from './ruvector.js';

/**
 * Get configuration based on environment
 */
export async function getConfig(): Promise<import('./default.js').Config> {
  const env = process.env['NODE_ENV'];

  if (env === 'production') {
    const { getProductionConfig } = await import('./production.js');
    return getProductionConfig();
  }

  const { defaultConfig } = await import('./default.js');
  return defaultConfig;
}
