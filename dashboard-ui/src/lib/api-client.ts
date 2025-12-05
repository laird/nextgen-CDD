/**
 * API Client for Thesis Validator Backend
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export class ThesisValidatorClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.data) {
          const apiError = error.response.data as { error?: string; message?: string };
          throw new Error(apiError.message || apiError.error || 'An error occurred');
        }
        throw error;
      }
    );
  }

  /**
   * Transform backend engagement format to frontend format
   */
  private transformEngagement(backendEng: any): any {
    if (!backendEng) return backendEng;
    return {
      ...backendEng,
      target_company: backendEng.target_company?.name || backendEng.name,
      sector: backendEng.target_company?.sector,
      description: backendEng.target_company?.description,
    };
  }

  /**
   * Transform array of backend engagements to frontend format
   */
  private transformEngagements(engagements: any[]): any[] {
    return engagements.map(e => this.transformEngagement(e));
  }

  // Engagements
  async getEngagements(filters?: { status?: string; sector?: string; limit?: number; offset?: number }) {
    const response = await this.client.get('/api/v1/engagements', { params: filters });
    const data = response.data;
    // Transform engagements array
    if (data.engagements) {
      data.engagements = this.transformEngagements(data.engagements);
    }
    return data;
  }

  async getEngagement(id: string) {
    const response = await this.client.get(`/api/v1/engagements/${id}`);
    const data = response.data;
    // Transform engagement if present
    if (data.engagement) {
      data.engagement = this.transformEngagement(data.engagement);
    }
    return data;
  }

  async createEngagement(data: any) {
    // Transform flat frontend data to backend schema
    const requestBody = {
      name: data.name || `Deal with ${data.target_company}`,
      client_name: data.client_name || data.target_company,
      deal_type: data.deal_type || 'buyout',
      target_company: {
        name: data.target_company,
        sector: data.sector || 'other',
        description: data.description,
      },
    };
    const response = await this.client.post('/api/v1/engagements', requestBody);
    const responseData = response.data;
    // Transform the created engagement
    if (responseData.engagement) {
      responseData.engagement = this.transformEngagement(responseData.engagement);
    }
    return responseData;
  }

  async updateEngagement(id: string, data: any) {
    const response = await this.client.patch(`/api/v1/engagements/${id}`, data);
    return response.data;
  }

  async deleteEngagement(id: string) {
    const response = await this.client.delete(`/api/v1/engagements/${id}`);
    return response.data;
  }

  // Research
  async startResearch(engagementId: string, thesis: string, config?: any) {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/research`,
      { thesis, config }
    );
    return response.data;
  }

  async getResearchJob(engagementId: string, jobId: string) {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/research/${jobId}`
    );
    return response.data;
  }

  // WebSocket URL helper
  getResearchProgressWsUrl(jobId: string, token?: string): string {
    const wsBaseUrl = API_BASE_URL.replace(/^http/, 'ws');
    const url = `${wsBaseUrl}/research/jobs/${jobId}/progress`;
    if (token) {
      return `${url}?token=${token}`;
    }
    return url;
  }

  // Health check
  async getHealth() {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Hypotheses
  async getHypothesisTree(engagementId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/engagements/${engagementId}/hypotheses`);
    return response.data;
  }

  async getHypothesis(engagementId: string, hypothesisId: string): Promise<{ hypothesis: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`
    );
    return response.data;
  }

  async createHypothesis(engagementId: string, data: any): Promise<{ hypothesis: any }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/hypotheses`,
      data
    );
    return response.data;
  }

  async updateHypothesis(
    engagementId: string,
    hypothesisId: string,
    data: any
  ): Promise<{ hypothesis: any }> {
    const response = await this.client.patch(
      `/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`,
      data
    );
    return response.data;
  }

  async deleteHypothesis(engagementId: string, hypothesisId: string): Promise<void> {
    await this.client.delete(`/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`);
  }
}

// Export a singleton instance
export const apiClient = new ThesisValidatorClient();
