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
export function getConfig(): import('./default.js').Config {
  const env = process.env['NODE_ENV'];

  if (env === 'production') {
    const { getProductionConfig } = require('./production.js');
    return getProductionConfig();
  }

  return require('./default.js').defaultConfig;
}
