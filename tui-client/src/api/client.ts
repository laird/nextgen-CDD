import axios, { type AxiosInstance } from 'axios';
import type {
  Engagement,
  EngagementFilters,
  CreateEngagementRequest,
  UpdateEngagementRequest,
  ResearchJob,
  ResearchConfig,
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
   */
  async startResearch(engagementId: string, config: ResearchConfig): Promise<ResearchJob> {
    const response = await this.http.post<{ job_id: string; status_url: string }>(
      `/api/v1/research/${engagementId}/research`,
      config
    );

    // Poll for job status
    const jobId = response.data.job_id;
    return this.getResearchJob(jobId);
  }

  /**
   * Get research job status
   */
  async getResearchJob(jobId: string): Promise<ResearchJob> {
    const response = await this.http.get<ResearchJob>(
      `/api/v1/research/jobs/${jobId}`
    );
    return response.data;
  }
}
