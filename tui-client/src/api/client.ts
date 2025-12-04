import axios, { type AxiosInstance } from 'axios';
import type {
  Engagement,
  EngagementFilters,
  CreateEngagementRequest,
  UpdateEngagementRequest,
  ResearchJob,
  ResearchConfig,
  ResearchResults,
  HealthStatus,
  SystemMetrics,
  APIError,
} from '../types/api.js';

export class ThesisValidatorClient {
  public readonly baseURL: string;
  private readonly http: AxiosInstance;

  constructor(baseURL: string, authToken?: string) {
    this.baseURL = baseURL;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    this.http = axios.create({
      baseURL,
      timeout: 30000,
      headers,
    });

    // Add response interceptor for error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.data) {
          const apiError: APIError = error.response.data;
          throw new Error(apiError.message || apiError.error);
        }
        throw error;
      }
    );
  }

  /**
   * Health check
   */
  async getHealth(): Promise<HealthStatus> {
    const response = await this.http.get<HealthStatus>('/health');
    return response.data;
  }

  /**
   * Get system metrics
   */
  async getMetrics(): Promise<SystemMetrics> {
    const response = await this.http.get<SystemMetrics>('/metrics');
    return response.data;
  }

  /**
   * List engagements
   */
  async getEngagements(filters?: EngagementFilters): Promise<Engagement[]> {
    const response = await this.http.get<{ engagements: Engagement[] }>(
      '/api/v1/engagements',
      { params: filters }
    );
    return response.data.engagements;
  }

  /**
   * Get single engagement
   */
  async getEngagement(id: string): Promise<Engagement> {
    const response = await this.http.get<{ engagement: Engagement }>(
      `/api/v1/engagements/${id}`
    );
    return response.data.engagement;
  }

  /**
   * Create engagement
   */
  async createEngagement(data: CreateEngagementRequest): Promise<Engagement> {
    const response = await this.http.post<{ engagement: Engagement }>(
      '/api/v1/engagements',
      data
    );
    return response.data.engagement;
  }

  /**
   * Update engagement
   */
  async updateEngagement(id: string, data: UpdateEngagementRequest): Promise<Engagement> {
    const response = await this.http.patch<{ engagement: Engagement }>(
      `/api/v1/engagements/${id}`,
      data
    );
    return response.data.engagement;
  }

  /**
   * Delete engagement
   */
  async deleteEngagement(id: string): Promise<void> {
    await this.http.delete(`/api/v1/engagements/${id}`);
  }

  /**
   * Start research workflow
   * Backend expects thesis to be already submitted via the /thesis endpoint,
   * but we'll pass the thesis config along
   */
  async startResearch(engagementId: string, thesis: string, config?: Partial<ResearchConfig>): Promise<{ job_id: string; status: string }> {
    // First submit the thesis
    await this.http.post(
      `/api/v1/engagements/${engagementId}/thesis`,
      { thesis_statement: thesis }
    );

    // Then start research
    const response = await this.http.post<{ job_id: string; message: string }>(
      `/api/v1/engagements/${engagementId}/research`,
      {
        depth: config?.searchDepth ?? 'standard',
        include_comparables: true,
        max_sources: 20,
      }
    );
    return { job_id: response.data.job_id, status: 'started' };
  }

  /**
   * Get research job status
   */
  async getResearchJob(_engagementId: string, jobId: string): Promise<ResearchJob> {
    // The backend returns job info at /api/v1/engagements/jobs/:jobId
    const response = await this.http.get<{
      job_id: string;
      engagement_id: string;
      type: string;
      status: string;
      progress: number;
      started_at: number;
      completed_at?: number;
      error?: string;
      result?: unknown;
    }>(`/api/v1/engagements/jobs/${jobId}`);

    const now = Date.now();
    // Map to ResearchJob format
    const job: ResearchJob = {
      id: response.data.job_id,
      engagement_id: response.data.engagement_id,
      status: response.data.status as ResearchJob['status'],
      config: {},
      created_at: response.data.started_at ?? now,
      updated_at: response.data.completed_at ?? now,
    };

    // Add optional fields only if they have values
    if (response.data.started_at !== undefined) {
      job.started_at = response.data.started_at;
    }
    if (response.data.completed_at !== undefined) {
      job.completed_at = response.data.completed_at;
    }
    if (response.data.result !== undefined) {
      job.results = response.data.result as ResearchResults;
    }

    return job;
  }

  /**
   * Get WebSocket URL for research progress
   */
  getResearchProgressWsUrl(jobId: string, token?: string): string {
    const wsBaseUrl = this.baseURL.replace(/^http/, 'ws');
    const url = `${wsBaseUrl}/research/jobs/${jobId}/progress`;
    if (token) {
      return `${url}?token=${token}`;
    }
    return url;
  }
}
