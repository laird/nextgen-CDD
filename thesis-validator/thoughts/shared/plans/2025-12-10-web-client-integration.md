# Web Client Backend Integration Plan

**Date:** 2025-12-10
**Status:** Ready for Implementation
**Priority:** High

## Executive Summary

The web client (dashboard-ui) currently implements ~48% of backend API functionality, compared to ~25% for the TUI. This plan addresses the missing integrations to bring the web client to full backend parity.

## Current State Analysis

### Implemented Features (Working)
- **Engagements**: CRUD, list with filters
- **Research**: Start workflow, progress WebSocket streaming, results display
- **Hypotheses**: Full CRUD, tree visualization with ReactFlow
- **Evidence**: Full CRUD, search/filter, quality charts
- **Documents**: Upload, list, delete

### Missing Features (0% Coverage)
1. **Contradictions** - Resolution workflow, severity tracking
2. **Stress Tests** - Execute tests, history, statistics
3. **Metrics** - Research quality dashboard
4. **Skills** - Library browser, execution

## Implementation Plan

---

## Slice 1: Type Definitions & API Client Extensions

**Goal:** Add TypeScript types and API client methods for all missing features

### Task 1.1: Add Contradiction Types to `types/api.ts`

```typescript
// Add to types/api.ts

export type ContradictionSeverity = 'low' | 'medium' | 'high';
export type ContradictionStatus = 'unresolved' | 'explained' | 'dismissed' | 'critical';

export interface Contradiction {
  id: string;
  engagementId: string;
  hypothesisId: string | null;
  evidenceId: string | null;
  description: string;
  severity: ContradictionSeverity;
  status: ContradictionStatus;
  bearCaseTheme: string | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContradictionFilters {
  severity?: ContradictionSeverity;
  status?: ContradictionStatus;
  hypothesisId?: string;
  limit?: number;
  offset?: number;
}

export interface ContradictionStats {
  total: number;
  bySeverity: Record<ContradictionSeverity, number>;
  byStatus: Record<ContradictionStatus, number>;
  resolutionRate: number;
}

export interface CreateContradictionRequest {
  hypothesisId?: string;
  evidenceId?: string;
  description: string;
  severity: ContradictionSeverity;
  bearCaseTheme?: string;
}

export interface ResolveContradictionRequest {
  status: 'explained' | 'dismissed';
  resolutionNotes: string;
}
```

### Task 1.2: Add Stress Test Types to `types/api.ts`

```typescript
export type StressTestIntensity = 'light' | 'moderate' | 'aggressive';
export type StressTestStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StressTest {
  id: string;
  engagementId: string;
  intensity: StressTestIntensity;
  status: StressTestStatus;
  vulnerabilitiesFound: number;
  scenariosRun: number;
  overallRiskScore: number | null;
  results: StressTestResults | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface StressTestResults {
  scenarios: Array<{
    name: string;
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    likelihood: number;
    findings: string[];
  }>;
  vulnerabilities: Array<{
    hypothesis: string;
    weakness: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string | null;
  }>;
  summary: string;
  overallAssessment: 'robust' | 'moderate' | 'vulnerable' | 'critical';
}

export interface StressTestStats {
  totalTests: number;
  averageRiskScore: number;
  lastTestAt: string | null;
  vulnerabilitiesByIntensity: Record<StressTestIntensity, number>;
}

export interface RunStressTestRequest {
  intensity: StressTestIntensity;
}
```

### Task 1.3: Add Metrics Types to `types/api.ts`

```typescript
export type MetricType =
  | 'evidence_credibility_avg'
  | 'source_diversity_score'
  | 'hypothesis_coverage'
  | 'contradiction_resolution_rate'
  | 'overall_confidence'
  | 'stress_test_vulnerability'
  | 'research_completeness';

export interface ResearchMetrics {
  evidenceCredibilityAvg: number;
  sourceDiversityScore: number;
  hypothesisCoverage: number;
  contradictionResolutionRate: number;
  overallConfidence: number;
  stressTestVulnerability: number;
  researchCompleteness: number;
  calculatedAt: string;
}

export interface MetricHistory {
  metricType: MetricType;
  values: Array<{
    value: number;
    recordedAt: string;
  }>;
}
```

### Task 1.4: Add Skill Types to `types/api.ts`

```typescript
export type SkillCategory =
  | 'market_sizing'
  | 'competitive'
  | 'financial'
  | 'risk'
  | 'operational'
  | 'regulatory'
  | 'customer'
  | 'technology'
  | 'general';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  successRate: number;
  usageCount: number;
  parameters: SkillParameter[];
  implementation?: string;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface SkillExecutionRequest {
  parameters: Record<string, unknown>;
  context?: {
    engagementId?: string;
    hypothesisId?: string;
  };
}

export interface SkillExecutionResult {
  success: boolean;
  output: unknown;
  executionTime: number;
  tokensUsed?: number;
}
```

### Task 1.5: Extend API Client with Contradiction Methods

Add to `lib/api-client.ts`:

```typescript
// Contradictions
async getContradictions(
  engagementId: string,
  filters?: ContradictionFilters
): Promise<{ contradictions: Contradiction[]; total: number }> {
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
): Promise<{ contradiction: Contradiction }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}`
  );
  return response.data;
}

async createContradiction(
  engagementId: string,
  data: CreateContradictionRequest
): Promise<{ contradiction: Contradiction }> {
  const response = await this.client.post(
    `/api/v1/engagements/${engagementId}/contradictions`,
    data
  );
  return response.data;
}

async resolveContradiction(
  engagementId: string,
  contradictionId: string,
  data: ResolveContradictionRequest
): Promise<{ contradiction: Contradiction; message: string }> {
  const response = await this.client.post(
    `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}/resolve`,
    data
  );
  return response.data;
}

async markContradictionCritical(
  engagementId: string,
  contradictionId: string
): Promise<{ contradiction: Contradiction; message: string }> {
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
): Promise<{ stats: ContradictionStats }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/contradictions/stats`
  );
  return response.data;
}
```

### Task 1.6: Extend API Client with Stress Test Methods

```typescript
// Stress Tests
async getStressTests(
  engagementId: string,
  filters?: { status?: StressTestStatus; limit?: number }
): Promise<{ stressTests: StressTest[]; count: number }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/stress-tests`,
    { params: filters }
  );
  return response.data;
}

async getStressTestStats(
  engagementId: string
): Promise<{ stats: StressTestStats }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/stress-tests/stats`
  );
  return response.data;
}

async runStressTest(
  engagementId: string,
  data: RunStressTestRequest
): Promise<{ stressTest: StressTest; message: string }> {
  const response = await this.client.post(
    `/api/v1/engagements/${engagementId}/stress-tests`,
    data
  );
  return response.data;
}

async getStressTest(
  engagementId: string,
  stressTestId: string
): Promise<{ stressTest: StressTest }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/stress-tests/${stressTestId}`
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
```

### Task 1.7: Extend API Client with Metrics Methods

```typescript
// Metrics
async getMetrics(engagementId: string): Promise<{ metrics: ResearchMetrics }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/metrics`
  );
  return response.data;
}

async calculateMetrics(
  engagementId: string
): Promise<{ metrics: ResearchMetrics; message: string }> {
  const response = await this.client.post(
    `/api/v1/engagements/${engagementId}/metrics/calculate`
  );
  return response.data;
}

async getMetricHistory(
  engagementId: string,
  metricType?: MetricType,
  limit?: number
): Promise<{ history: MetricHistory[] }> {
  const response = await this.client.get(
    `/api/v1/engagements/${engagementId}/metrics/history`,
    { params: { metric_type: metricType, limit } }
  );
  return response.data;
}
```

### Task 1.8: Extend API Client with Skills Methods

```typescript
// Skills
async getSkills(filters?: {
  category?: SkillCategory;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ skills: Skill[]; total: number }> {
  const response = await this.client.get('/api/v1/skills', { params: filters });
  return response.data;
}

async getSkill(skillId: string): Promise<{ skill: Skill }> {
  const response = await this.client.get(`/api/v1/skills/${skillId}`);
  return response.data;
}

async executeSkill(
  skillId: string,
  data: SkillExecutionRequest
): Promise<SkillExecutionResult> {
  const response = await this.client.post(
    `/api/v1/skills/${skillId}/execute`,
    data
  );
  return response.data;
}
```

### Verification for Slice 1
- [ ] TypeScript compilation passes with `npm run build`
- [ ] Types correctly match backend API responses
- [ ] API client can be imported without errors

---

## Slice 2: React Query Hooks

**Goal:** Create reusable hooks for data fetching and mutations

### Task 2.1: Create `useContradictions.ts` Hook

Create file: `hooks/useContradictions.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type {
  Contradiction,
  ContradictionFilters,
  CreateContradictionRequest,
  ResolveContradictionRequest,
} from '../types/api';

export function useContradictions(engagementId: string, filters?: ContradictionFilters) {
  return useQuery({
    queryKey: ['contradictions', engagementId, filters],
    queryFn: () => apiClient.getContradictions(engagementId, filters),
    enabled: !!engagementId,
  });
}

export function useContradiction(engagementId: string, contradictionId: string) {
  return useQuery({
    queryKey: ['contradiction', engagementId, contradictionId],
    queryFn: () => apiClient.getContradiction(engagementId, contradictionId),
    enabled: !!engagementId && !!contradictionId,
  });
}

export function useContradictionStats(engagementId: string) {
  return useQuery({
    queryKey: ['contradictionStats', engagementId],
    queryFn: () => apiClient.getContradictionStats(engagementId),
    enabled: !!engagementId,
  });
}

export function useCreateContradiction(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateContradictionRequest) =>
      apiClient.createContradiction(engagementId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contradictions', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['contradictionStats', engagementId] });
    },
  });
}

export function useResolveContradiction(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      contradictionId,
      data,
    }: {
      contradictionId: string;
      data: ResolveContradictionRequest;
    }) => apiClient.resolveContradiction(engagementId, contradictionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contradictions', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['contradictionStats', engagementId] });
    },
  });
}

export function useMarkCritical(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contradictionId: string) =>
      apiClient.markContradictionCritical(engagementId, contradictionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contradictions', engagementId] });
    },
  });
}

export function useDeleteContradiction(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contradictionId: string) =>
      apiClient.deleteContradiction(engagementId, contradictionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contradictions', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['contradictionStats', engagementId] });
    },
  });
}
```

### Task 2.2: Create `useStressTests.ts` Hook

Create file: `hooks/useStressTests.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { StressTestIntensity, StressTestStatus } from '../types/api';

export function useStressTests(
  engagementId: string,
  filters?: { status?: StressTestStatus; limit?: number }
) {
  return useQuery({
    queryKey: ['stressTests', engagementId, filters],
    queryFn: () => apiClient.getStressTests(engagementId, filters),
    enabled: !!engagementId,
  });
}

export function useStressTest(engagementId: string, stressTestId: string) {
  return useQuery({
    queryKey: ['stressTest', engagementId, stressTestId],
    queryFn: () => apiClient.getStressTest(engagementId, stressTestId),
    enabled: !!engagementId && !!stressTestId,
  });
}

export function useStressTestStats(engagementId: string) {
  return useQuery({
    queryKey: ['stressTestStats', engagementId],
    queryFn: () => apiClient.getStressTestStats(engagementId),
    enabled: !!engagementId,
  });
}

export function useRunStressTest(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intensity: StressTestIntensity) =>
      apiClient.runStressTest(engagementId, { intensity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stressTests', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['stressTestStats', engagementId] });
    },
  });
}

export function useDeleteStressTest(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stressTestId: string) =>
      apiClient.deleteStressTest(engagementId, stressTestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stressTests', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['stressTestStats', engagementId] });
    },
  });
}
```

### Task 2.3: Create `useMetrics.ts` Hook

Create file: `hooks/useMetrics.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { MetricType } from '../types/api';

export function useMetrics(engagementId: string) {
  return useQuery({
    queryKey: ['metrics', engagementId],
    queryFn: () => apiClient.getMetrics(engagementId),
    enabled: !!engagementId,
  });
}

export function useMetricHistory(
  engagementId: string,
  metricType?: MetricType,
  limit?: number
) {
  return useQuery({
    queryKey: ['metricHistory', engagementId, metricType, limit],
    queryFn: () => apiClient.getMetricHistory(engagementId, metricType, limit),
    enabled: !!engagementId,
  });
}

export function useCalculateMetrics(engagementId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.calculateMetrics(engagementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metrics', engagementId] });
      queryClient.invalidateQueries({ queryKey: ['metricHistory', engagementId] });
    },
  });
}
```

### Task 2.4: Create `useSkills.ts` Hook

Create file: `hooks/useSkills.ts`

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { SkillCategory, SkillExecutionRequest } from '../types/api';

export function useSkills(filters?: {
  category?: SkillCategory;
  query?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['skills', filters],
    queryFn: () => apiClient.getSkills(filters),
  });
}

export function useSkill(skillId: string) {
  return useQuery({
    queryKey: ['skill', skillId],
    queryFn: () => apiClient.getSkill(skillId),
    enabled: !!skillId,
  });
}

export function useExecuteSkill(skillId: string) {
  return useMutation({
    mutationFn: (data: SkillExecutionRequest) =>
      apiClient.executeSkill(skillId, data),
  });
}
```

### Verification for Slice 2
- [ ] All hooks export correctly
- [ ] React Query integration works (test with devtools)
- [ ] Cache invalidation triggers on mutations

---

## Slice 3: Contradictions UI Components

**Goal:** Build the Contradictions tab with list, detail panel, and resolution workflow

### Task 3.1: Create `ContradictionList.tsx`

Create file: `components/contradiction/ContradictionList.tsx`

Features:
- Filterable list by severity and status
- Severity badges (low=gray, medium=yellow, high=red)
- Status indicators with icons
- Click to select contradiction
- Bear case theme grouping (optional toggle)

### Task 3.2: Create `ContradictionDetailPanel.tsx`

Create file: `components/contradiction/ContradictionDetailPanel.tsx`

Features:
- Full contradiction details display
- Linked hypothesis/evidence with navigation
- Resolution form with notes textarea
- Resolve as "explained" or "dismissed" buttons
- Mark as "critical" action

### Task 3.3: Create `ContradictionStats.tsx`

Create file: `components/contradiction/ContradictionStats.tsx`

Features:
- Donut chart by severity using Recharts
- Bar chart by status
- Resolution rate percentage
- Total count display

### Task 3.4: Create `components/contradiction/index.ts`

Export all contradiction components.

### Task 3.5: Add Contradictions Tab to EngagementDetail

Update `EngagementDetail.tsx`:
- Add 'contradictions' to TabType
- Add tab button after Evidence
- Add tab content with ContradictionList + ContradictionDetailPanel layout

---

## Slice 4: Stress Test UI Components

**Goal:** Build the Stress Test tab with execution controls and results display

### Task 4.1: Create `StressTestRunner.tsx`

Create file: `components/stress-test/StressTestRunner.tsx`

Features:
- Intensity selector (light/moderate/aggressive) with descriptions
- Run button with confirmation dialog
- Progress indicator while running
- Disable if test already running

### Task 4.2: Create `StressTestResults.tsx`

Create file: `components/stress-test/StressTestResults.tsx`

Features:
- Overall assessment badge (robust=green, moderate=yellow, vulnerable=orange, critical=red)
- Risk score gauge
- Scenario cards with impact indicators
- Vulnerability list with mitigation suggestions

### Task 4.3: Create `StressTestHistory.tsx`

Create file: `components/stress-test/StressTestHistory.tsx`

Features:
- Table with date, intensity, status, risk score
- Click to view full results
- Delete action with confirmation

### Task 4.4: Create `components/stress-test/index.ts`

Export all stress test components.

### Task 4.5: Add Stress Tests Tab to EngagementDetail

Update `EngagementDetail.tsx`:
- Add 'stress-tests' to TabType
- Add tab content with StressTestRunner + StressTestHistory layout

---

## Slice 5: Metrics Dashboard Components

**Goal:** Build the Metrics tab with quality indicators and historical charts

### Task 5.1: Create `MetricsGauges.tsx`

Create file: `components/metrics/MetricsGauges.tsx`

Features:
- 7 circular gauge indicators for each metric type
- Color coding based on value (red < 40, yellow 40-70, green > 70)
- Metric labels and values

### Task 5.2: Create `MetricsHistory.tsx`

Create file: `components/metrics/MetricsHistory.tsx`

Features:
- Line chart showing metric trends over time
- Metric type selector dropdown
- Date range (last 7/30/90 days)
- Using Recharts (already a dependency)

### Task 5.3: Create `components/metrics/index.ts`

Export all metrics components.

### Task 5.4: Add Metrics Tab to EngagementDetail

Update `EngagementDetail.tsx`:
- Add 'metrics' to TabType
- Add "Recalculate" button that calls calculateMetrics mutation
- Add tab content with MetricsGauges + MetricsHistory layout

---

## Slice 6: Skills Library Page

**Goal:** Add a Skills page accessible from sidebar

### Task 6.1: Create `SkillsPage.tsx`

Create file: `components/skills/SkillsPage.tsx`

Features:
- Category filter tabs
- Search input
- Skill cards with name, description, success rate, usage count
- Click to expand/view details

### Task 6.2: Create `SkillDetail.tsx`

Create file: `components/skills/SkillDetail.tsx`

Features:
- Full skill description
- Parameters list with types and defaults
- Execute button (opens execution modal)
- Version and metrics display

### Task 6.3: Create `SkillExecuteModal.tsx`

Create file: `components/skills/SkillExecuteModal.tsx`

Features:
- Parameter input form (dynamically generated)
- Optional engagement context selector
- Execute button with loading state
- Results display

### Task 6.4: Create `components/skills/index.ts`

Export all skills components.

### Task 6.5: Add Skills to Sidebar Navigation

Update `Sidebar.tsx`:
- Add "Skills Library" link
- Add route handling in App.tsx

---

## Verification Checklist

### Per-Slice Verification
Each slice should verify:
1. TypeScript compiles without errors
2. Component renders without runtime errors
3. Data loads correctly from API
4. Mutations update UI optimistically or on success
5. Error states display appropriately
6. Loading states show spinners/skeletons

### Full Integration Test
1. Create new engagement
2. Run research workflow
3. View generated hypotheses
4. View collected evidence
5. View/resolve contradictions ← NEW
6. Run stress test ← NEW
7. View metrics dashboard ← NEW
8. Browse skills library ← NEW
9. Execute a skill ← NEW

---

## Priority Order

1. **Slice 1** (Types + API Client) - Foundation, must be first
2. **Slice 2** (Hooks) - Needed by all UI components
3. **Slice 3** (Contradictions) - Highest business value
4. **Slice 4** (Stress Tests) - Core differentiator
5. **Slice 5** (Metrics) - Quality visibility
6. **Slice 6** (Skills) - Advanced feature

---

## Files to Create

```
dashboard-ui/src/
├── types/
│   └── api.ts (UPDATE - add new types)
├── lib/
│   └── api-client.ts (UPDATE - add new methods)
├── hooks/
│   ├── useContradictions.ts (NEW)
│   ├── useStressTests.ts (NEW)
│   ├── useMetrics.ts (NEW)
│   └── useSkills.ts (NEW)
├── components/
│   ├── contradiction/
│   │   ├── ContradictionList.tsx (NEW)
│   │   ├── ContradictionDetailPanel.tsx (NEW)
│   │   ├── ContradictionStats.tsx (NEW)
│   │   └── index.ts (NEW)
│   ├── stress-test/
│   │   ├── StressTestRunner.tsx (NEW)
│   │   ├── StressTestResults.tsx (NEW)
│   │   ├── StressTestHistory.tsx (NEW)
│   │   └── index.ts (NEW)
│   ├── metrics/
│   │   ├── MetricsGauges.tsx (NEW)
│   │   ├── MetricsHistory.tsx (NEW)
│   │   └── index.ts (NEW)
│   ├── skills/
│   │   ├── SkillsPage.tsx (NEW)
│   │   ├── SkillDetail.tsx (NEW)
│   │   ├── SkillExecuteModal.tsx (NEW)
│   │   └── index.ts (NEW)
│   ├── engagement/
│   │   └── EngagementDetail.tsx (UPDATE - add new tabs)
│   └── sidebar/
│       └── Sidebar.tsx (UPDATE - add Skills link)
└── App.tsx (UPDATE - add Skills route)
```

**Total: 4 files updated, 16 new files created**
