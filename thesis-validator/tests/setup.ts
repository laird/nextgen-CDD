/**
 * Test Setup
 *
 * Polyfills and globals needed for tests
 */

import { webcrypto } from 'crypto';

// Polyfill crypto for Node.js environment
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - webcrypto is compatible with global crypto
  globalThis.crypto = webcrypto;
}
