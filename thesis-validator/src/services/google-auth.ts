/**
 * Google Cloud Authentication Service
 *
 * Provides authentication for Google Cloud services using Application Default Credentials (ADC).
 * Supports multiple authentication methods:
 * 1. Service account key file (GOOGLE_APPLICATION_CREDENTIALS)
 * 2. Workload Identity (for GKE/Cloud Run)
 * 3. User credentials (gcloud auth application-default login)
 * 4. Compute Engine default service account
 */

import { GoogleAuth, OAuth2Client } from 'google-auth-library';

/**
 * Google Cloud authentication configuration
 */
export interface GoogleAuthConfig {
  projectId?: string;
  region?: string;
  keyFilePath?: string;
  scopes?: string[];
}

/**
 * Default scopes required for Vertex AI
 */
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
];

/**
 * Google Cloud Authentication Service
 *
 * Uses Application Default Credentials (ADC) to authenticate with Google Cloud.
 * ADC automatically selects the best available credentials in this order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 2. Workload Identity (GKE, Cloud Run)
 * 3. Compute Engine/Cloud Functions default service account
 * 4. User credentials from gcloud CLI
 */
export class GoogleAuthService {
  private auth: GoogleAuth;
  private projectId: string | undefined;
  private region: string;
  private initialized: boolean = false;

  constructor(config: GoogleAuthConfig = {}) {
    this.projectId = config.projectId ?? process.env['GOOGLE_CLOUD_PROJECT'];
    this.region = config.region ?? process.env['GOOGLE_CLOUD_REGION'] ?? 'us-central1';

    const authOptions: {
      scopes: string[];
      keyFilename?: string;
      projectId?: string;
    } = {
      scopes: config.scopes ?? DEFAULT_SCOPES,
    };

    const keyFilePath = config.keyFilePath ?? process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    if (keyFilePath !== undefined) {
      authOptions.keyFilename = keyFilePath;
    }

    if (this.projectId !== undefined) {
      authOptions.projectId = this.projectId;
    }

    this.auth = new GoogleAuth(authOptions);
  }

  /**
   * Initialize and validate the authentication
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Get project ID if not provided
      if (!this.projectId) {
        this.projectId = await this.auth.getProjectId();
      }

      // Validate credentials by attempting to get an access token
      const client = await this.auth.getClient();
      await client.getAccessToken();

      this.initialized = true;
      console.log(`[GoogleAuth] Initialized for project: ${this.projectId}, region: ${this.region}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Google Cloud authentication: ${message}`);
    }
  }

  /**
   * Get the project ID
   */
  getProjectId(): string {
    if (!this.projectId) {
      throw new Error('Project ID not available. Call initialize() first or set GOOGLE_CLOUD_PROJECT.');
    }
    return this.projectId;
  }

  /**
   * Get the region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Get an authenticated client
   */
  async getClient(): Promise<OAuth2Client> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.auth.getClient() as Promise<OAuth2Client>;
  }

  /**
   * Get a fresh access token
   */
  async getAccessToken(): Promise<string> {
    const client = await this.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new Error('Failed to obtain access token');
    }

    return tokenResponse.token;
  }

  /**
   * Check if credentials are valid and not expired
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get authentication headers for API requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Get the GoogleAuth instance for direct use
   */
  getGoogleAuth(): GoogleAuth {
    return this.auth;
  }
}

/**
 * Singleton instance for shared authentication
 */
let sharedInstance: GoogleAuthService | null = null;

/**
 * Get shared Google Auth service instance
 */
export function getGoogleAuthService(config?: GoogleAuthConfig): GoogleAuthService {
  if (!sharedInstance) {
    sharedInstance = new GoogleAuthService(config);
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (useful for testing)
 */
export function resetGoogleAuthService(): void {
  sharedInstance = null;
}
