/**
 * API Client for Thesis Validator Backend
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios';

// Runtime config interface (injected via config.js in production)
declare global {
  interface Window {
    __CONFIG__?: {
      API_URL?: string;
    };
  }
}

// Priority: runtime config > env var > relative URLs (nginx proxy) > localhost dev
function getApiBaseUrl(): string {
  // Runtime config (set at container startup, allows override without rebuild)
  if (typeof window !== 'undefined' && window.__CONFIG__?.API_URL) {
    return window.__CONFIG__.API_URL;
  }
  // Build-time env var
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Production: use relative URLs (proxied through nginx)
  if (import.meta.env.PROD) {
    return '';
  }
  // Development fallback
  return 'http://localhost:3000';
}

const API_BASE_URL = getApiBaseUrl();

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

  // Thesis
  async submitThesis(engagementId: string, thesisStatement: string, valueCreationLevers?: string[]) {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/thesis`,
      {
        thesis_statement: thesisStatement,
        value_creation_levers: valueCreationLevers
      }
    );
    return response.data;
  }

  // Research
  async startResearch(engagementId: string, thesis: string, config?: any) {
    // First submit the thesis to the engagement
    await this.submitThesis(engagementId, thesis);

    // Then start the research workflow
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/research`,
      { ...config }
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

  // Evidence
  async getEvidence(engagementId: string, filters?: any): Promise<{ evidence: any[]; total: number }> {
    const params: Record<string, string | number> = {};
    if (filters?.sourceType) params.source_type = filters.sourceType;
    if (filters?.sentiment) params.sentiment = filters.sentiment;
    if (filters?.minCredibility !== undefined) params.min_credibility = filters.minCredibility;
    if (filters?.hypothesisId) params.hypothesis_id = filters.hypothesisId;
    if (filters?.documentId) params.document_id = filters.documentId;
    if (filters?.limit) params.limit = filters.limit;
    if (filters?.offset) params.offset = filters.offset;

    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/evidence`,
      { params }
    );
    return response.data;
  }

  async getEvidenceStats(engagementId: string): Promise<{ stats: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/evidence/stats`
    );
    return response.data;
  }

  async getEvidenceById(engagementId: string, evidenceId: string): Promise<{ evidence: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/evidence/${evidenceId}`
    );
    return response.data;
  }

  async createEvidence(engagementId: string, data: any): Promise<{ evidence: any }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/evidence`,
      data
    );
    return response.data;
  }

  async updateEvidence(engagementId: string, evidenceId: string, data: any): Promise<{ evidence: any }> {
    const response = await this.client.patch(
      `/api/v1/engagements/${engagementId}/evidence/${evidenceId}`,
      data
    );
    return response.data;
  }

  async deleteEvidence(engagementId: string, evidenceId: string): Promise<void> {
    await this.client.delete(`/api/v1/engagements/${engagementId}/evidence/${evidenceId}`);
  }

  async linkEvidenceToHypothesis(
    engagementId: string,
    evidenceId: string,
    hypothesisId: string,
    relevanceScore?: number
  ): Promise<void> {
    await this.client.post(
      `/api/v1/engagements/${engagementId}/evidence/${evidenceId}/hypotheses`,
      { hypothesisId, relevanceScore }
    );
  }

  async unlinkEvidenceFromHypothesis(
    engagementId: string,
    evidenceId: string,
    hypothesisId: string
  ): Promise<void> {
    await this.client.delete(
      `/api/v1/engagements/${engagementId}/evidence/${evidenceId}/hypotheses/${hypothesisId}`
    );
  }

  // Documents
  async getDocuments(engagementId: string, filters?: any): Promise<{ documents: any[]; total: number }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/documents`,
      { params: filters }
    );
    return response.data;
  }

  async getDocument(engagementId: string, documentId: string): Promise<{ document: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/documents/${documentId}`
    );
    return response.data;
  }

  async uploadDocument(engagementId: string, file: File): Promise<{ document_id: string; status: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/documents`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  async deleteDocument(engagementId: string, documentId: string): Promise<void> {
    await this.client.delete(`/api/v1/engagements/${engagementId}/documents/${documentId}`);
  }

  // ==========================================================================
  // Contradictions
  // ==========================================================================

  async getContradictions(
    engagementId: string,
    filters?: {
      severity?: 'low' | 'medium' | 'high';
      status?: 'unresolved' | 'explained' | 'dismissed' | 'critical';
      hypothesisId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ contradictions: any[]; total: number }> {
    const params: Record<string, string | number> = {};
    if (filters?.severity) params.severity = filters.severity;
    if (filters?.status) params.status = filters.status;
    if (filters?.hypothesisId) params.hypothesis_id = filters.hypothesisId;
    if (filters?.limit) params.limit = filters.limit;
    if (filters?.offset) params.offset = filters.offset;

    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/contradictions`,
      { params }
    );
    return response.data;
  }

  async getContradiction(
    engagementId: string,
    contradictionId: string
  ): Promise<{ contradiction: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}`
    );
    return response.data;
  }

  async createContradiction(
    engagementId: string,
    data: {
      hypothesisId?: string;
      evidenceId?: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      bearCaseTheme?: string;
    }
  ): Promise<{ contradiction: any }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/contradictions`,
      data
    );
    return response.data;
  }

  async resolveContradiction(
    engagementId: string,
    contradictionId: string,
    data: {
      status: 'explained' | 'dismissed';
      resolutionNotes: string;
    }
  ): Promise<{ contradiction: any; message: string }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}/resolve`,
      data
    );
    return response.data;
  }

  async markContradictionCritical(
    engagementId: string,
    contradictionId: string
  ): Promise<{ contradiction: any; message: string }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}/critical`
    );
    return response.data;
  }

  async deleteContradiction(
    engagementId: string,
    contradictionId: string
  ): Promise<void> {
    await this.client.delete(
      `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}`
    );
  }

  async getContradictionStats(
    engagementId: string
  ): Promise<{ stats: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/contradictions/stats`
    );
    return response.data;
  }

  // ==========================================================================
  // Stress Tests
  // ==========================================================================

  async getStressTests(
    engagementId: string,
    filters?: { status?: 'pending' | 'running' | 'completed' | 'failed'; limit?: number }
  ): Promise<{ stressTests: any[]; count: number }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/stress-tests`,
      { params: filters }
    );
    return response.data;
  }

  async getStressTest(
    engagementId: string,
    stressTestId: string
  ): Promise<{ stressTest: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/stress-tests/${stressTestId}`
    );
    return response.data;
  }

  async getStressTestStats(
    engagementId: string
  ): Promise<{ stats: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/stress-tests/stats`
    );
    return response.data;
  }

  async runStressTest(
    engagementId: string,
    data: { intensity: 'light' | 'moderate' | 'aggressive' }
  ): Promise<{ stressTest: any; message: string }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/stress-tests`,
      data
    );
    return response.data;
  }

  async deleteStressTest(
    engagementId: string,
    stressTestId: string
  ): Promise<void> {
    await this.client.delete(
      `/api/v1/engagements/${engagementId}/stress-tests/${stressTestId}`
    );
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  async getMetrics(engagementId: string): Promise<{ metrics: any }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/metrics`
    );
    return response.data;
  }

  async calculateMetrics(
    engagementId: string
  ): Promise<{ metrics: any; message: string }> {
    const response = await this.client.post(
      `/api/v1/engagements/${engagementId}/metrics/calculate`
    );
    return response.data;
  }

  async getMetricHistory(
    engagementId: string,
    metricType?: string,
    limit?: number
  ): Promise<{ history: any[] }> {
    const response = await this.client.get(
      `/api/v1/engagements/${engagementId}/metrics/history`,
      { params: { metric_type: metricType, limit } }
    );
    return response.data;
  }

  // ==========================================================================
  // Skills
  // ==========================================================================

  async getSkills(filters?: {
    category?: string;
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ skills: any[]; total: number }> {
    const response = await this.client.get('/api/v1/skills', { params: filters });
    return response.data;
  }

  async getSkill(skillId: string): Promise<{ skill: any }> {
    const response = await this.client.get(`/api/v1/skills/${skillId}`);
    return response.data;
  }

  async executeSkill(
    skillId: string,
    data: {
      parameters: Record<string, unknown>;
      context?: {
        engagementId?: string;
        hypothesisId?: string;
      };
    }
  ): Promise<{ success: boolean; output: unknown; executionTime: number; tokensUsed?: number }> {
    const response = await this.client.post(
      `/api/v1/skills/${skillId}/execute`,
      data
    );
    return response.data;
  }
}

// Export a singleton instance
export const apiClient = new ThesisValidatorClient();
