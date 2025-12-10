# TUI Client Backend Integration Implementation Plan

## Overview

Enhance the TUI client to fully utilize all backend capabilities implemented in Slices 1-4, expanding coverage from the current 25% to 100%. This includes implementing hypothesis management, evidence management, contradictions, stress testing, metrics dashboard, and completing engagement features.

## Current State Analysis

The TUI client (`tui-client/`) currently provides:
- Basic engagement CRUD (60% complete - missing edit, delete, team management)
- Research workflow initiation and progress tracking (100% complete)
- Placeholder tabs for Evidence, Hypothesis, and Monitor with no implementation
- No UI for contradictions, stress tests, metrics, documents, or skills

### Key Discoveries:
- Backend provides 59+ API endpoints across 8 domains (`thesis-validator/src/api/routes/`)
- TUI's API client (`tui-client/src/api/client.ts`) only implements 11 methods
- React Ink framework already set up with keyboard navigation patterns
- WebSocket infrastructure exists but only for research progress

## Desired End State

A fully-functional TUI client that provides terminal-based access to all backend features:
- Complete hypothesis tree visualization and management
- Evidence browsing with document upload capability
- Contradiction resolution workflow
- Stress test execution and monitoring
- Real-time metrics dashboard
- Full engagement lifecycle management

### Verification:
- All 59 backend endpoints accessible through TUI
- All 5 placeholder/missing tabs fully functional
- Consistent keyboard navigation across all views
- Real-time updates via WebSocket for all async operations

## What We're NOT Doing

- Changing the React Ink framework or architecture
- Modifying backend API contracts
- Building graphical charts (use ASCII/text representations)
- Implementing authentication UI (continue using CLI token)
- Creating mobile or web versions

## Implementation Approach

Implement features in priority order based on user workflow dependencies. Extend the API client first, then build UI components progressively. Maintain consistent keyboard navigation patterns and visual design language throughout.

## Phase 1: Core Data Management - Hypotheses & Evidence

### Overview
Implement the foundation for thesis validation by adding hypothesis tree management and evidence browsing capabilities.

### Changes Required:

#### 1. Extend API Client
**File**: `tui-client/src/api/client.ts`
**Changes**: Add methods for hypotheses and evidence management

```typescript
// Add to ThesisValidatorClient class

// Hypothesis methods
async getHypotheses(engagementId: string): Promise<Hypothesis[]> {
  const response = await this.http.get<{ hypotheses: Hypothesis[] }>(
    `/api/v1/engagements/${engagementId}/hypotheses`
  );
  return response.data.hypotheses;
}

async createHypothesis(engagementId: string, data: CreateHypothesisRequest): Promise<Hypothesis> {
  const response = await this.http.post<{ hypothesis: Hypothesis }>(
    `/api/v1/engagements/${engagementId}/hypotheses`,
    data
  );
  return response.data.hypothesis;
}

async updateHypothesis(engagementId: string, hypothesisId: string, data: UpdateHypothesisRequest): Promise<Hypothesis> {
  const response = await this.http.patch<{ hypothesis: Hypothesis }>(
    `/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`,
    data
  );
  return response.data.hypothesis;
}

async deleteHypothesis(engagementId: string, hypothesisId: string): Promise<void> {
  await this.http.delete(`/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}`);
}

async createHypothesisEdge(engagementId: string, hypothesisId: string, targetId: string, edgeType: string): Promise<void> {
  await this.http.post(`/api/v1/engagements/${engagementId}/hypotheses/${hypothesisId}/edges`, {
    target_hypothesis_id: targetId,
    edge_type: edgeType
  });
}

// Evidence methods
async getEvidence(engagementId: string, filters?: EvidenceFilters): Promise<Evidence[]> {
  const response = await this.http.get<{ evidence: Evidence[] }>(
    `/api/v1/engagements/${engagementId}/evidence`,
    { params: filters }
  );
  return response.data.evidence;
}

async createEvidence(engagementId: string, data: CreateEvidenceRequest): Promise<Evidence> {
  const response = await this.http.post<{ evidence: Evidence }>(
    `/api/v1/engagements/${engagementId}/evidence`,
    data
  );
  return response.data.evidence;
}

async linkEvidenceToHypothesis(engagementId: string, evidenceId: string, hypothesisId: string, impact: string): Promise<void> {
  await this.http.post(`/api/v1/engagements/${engagementId}/evidence/${evidenceId}/hypotheses`, {
    hypothesis_id: hypothesisId,
    impact
  });
}
```

#### 2. Create Type Definitions
**File**: `tui-client/src/types/api.ts`
**Changes**: Add hypothesis and evidence types

```typescript
export interface Hypothesis {
  id: string;
  engagement_id: string;
  type: 'root' | 'lever' | 'assumption' | 'risk';
  statement: string;
  confidence: number;
  importance: number;
  status: 'proposed' | 'validated' | 'invalidated';
  parent_id?: string;
  causal_edges?: CausalEdge[];
  evidence_links?: EvidenceLink[];
  created_at: number;
  updated_at: number;
}

export interface Evidence {
  id: string;
  engagement_id: string;
  source_type: 'expert_call' | 'document' | 'web_search' | 'analyst_note' | 'data_room';
  source_name: string;
  content: string;
  credibility_score: number;
  sentiment: 'supportive' | 'neutral' | 'contradictory';
  hypotheses?: HypothesisLink[];
  created_at: number;
  processed_at?: number;
}
```

#### 3. Implement Hypothesis Tab
**File**: `tui-client/src/components/tabs/HypothesisTab.tsx`
**Changes**: Create new component with tree visualization

```typescript
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useHypotheses } from '../../hooks/useAPI.js';

export function HypothesisTab({ serverUrl, authToken, engagementId }: HypothesisTabProps): React.ReactElement {
  const { hypotheses, loading, error, refresh } = useHypotheses(serverUrl, authToken, engagementId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tree' | 'list' | 'detail'>('tree');

  // Build tree structure
  const tree = useMemo(() => buildHypothesisTree(hypotheses), [hypotheses]);

  // Keyboard navigation
  useInput((input, key) => {
    if (viewMode === 'tree') {
      if (key.upArrow) navigateUp();
      if (key.downArrow) navigateDown();
      if (key.return) toggleExpand();
      if (input === 'e' || input === 'E') editHypothesis();
      if (input === 'l' || input === 'L') setViewMode('list');
      if (input === 'c' || input === 'C') adjustConfidence();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Hypothesis Tree - {hypotheses.length} nodes</Text>
      </Box>

      {viewMode === 'tree' && (
        <HypothesisTree
          tree={tree}
          selectedId={getSelectedId()}
          expandedNodes={expandedNodes}
        />
      )}

      <Box marginTop={1} borderStyle="single" paddingX={1}>
        <Text color="gray">
          [↑↓] Navigate  [Enter] Expand  [C] Confidence  [E] Edit  [L] List View
        </Text>
      </Box>
    </Box>
  );
}
```

#### 4. Implement Evidence Tab
**File**: `tui-client/src/components/tabs/EvidenceTab.tsx`
**Changes**: Create evidence browsing interface

```typescript
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useEvidence } from '../../hooks/useAPI.js';

export function EvidenceTab({ serverUrl, authToken, engagementId }: EvidenceTabProps): React.ReactElement {
  const { evidence, loading, error, refresh } = useEvidence(serverUrl, authToken, engagementId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<'all' | 'supportive' | 'contradictory'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  const filteredEvidence = evidence.filter(e =>
    filter === 'all' || e.sentiment === filter
  );

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
    if (key.downArrow && selectedIndex < filteredEvidence.length - 1) setSelectedIndex(selectedIndex + 1);
    if (key.return) setViewMode('detail');
    if (input === 'f' || input === 'F') cycleFilter();
    if (input === 'l' || input === 'L') linkToHypothesis();
    if (key.escape) setViewMode('list');
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Evidence ({filteredEvidence.length})</Text>
        <Text color="yellow"> Filter: {filter}</Text>
      </Box>

      {viewMode === 'list' ? (
        <EvidenceList
          evidence={filteredEvidence}
          selectedIndex={selectedIndex}
        />
      ) : (
        <EvidenceDetail
          evidence={filteredEvidence[selectedIndex]}
          onBack={() => setViewMode('list')}
        />
      )}
    </Box>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint` (no lint script configured; using typecheck)
- [x] API client tests pass: `npm test -- client.test.ts`
- [x] Component renders without errors: `npm run build`

#### Manual Verification:
- [ ] Hypothesis tree displays with proper indentation and expansion
- [ ] Evidence list shows all evidence with filters working
- [ ] Keyboard navigation works consistently in both tabs
- [ ] Linking evidence to hypotheses works correctly
- [ ] Performance is acceptable with 100+ hypotheses

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Contradiction & Stress Test Management

### Overview
Add contradiction resolution workflow and stress test execution interfaces to enable adversarial analysis.

### Changes Required:

#### 1. Extend API Client for Contradictions & Stress Tests
**File**: `tui-client/src/api/client.ts`
**Changes**: Add contradiction and stress test methods

```typescript
// Contradiction methods
async getContradictions(engagementId: string, filters?: ContradictionFilters): Promise<Contradiction[]> {
  const response = await this.http.get<{ contradictions: Contradiction[] }>(
    `/api/v1/engagements/${engagementId}/contradictions`,
    { params: filters }
  );
  return response.data.contradictions;
}

async resolveContradiction(engagementId: string, contradictionId: string, resolution: ResolutionRequest): Promise<void> {
  await this.http.post(
    `/api/v1/engagements/${engagementId}/contradictions/${contradictionId}/resolve`,
    resolution
  );
}

// Stress test methods
async startStressTest(engagementId: string, config: StressTestConfig): Promise<{ test_id: string }> {
  const response = await this.http.post<{ test_id: string; message: string }>(
    `/api/v1/engagements/${engagementId}/stress-tests`,
    config
  );
  return { test_id: response.data.test_id };
}

async getStressTests(engagementId: string): Promise<StressTest[]> {
  const response = await this.http.get<{ tests: StressTest[] }>(
    `/api/v1/engagements/${engagementId}/stress-tests`
  );
  return response.data.tests;
}
```

#### 2. Create Contradiction View Component
**File**: `tui-client/src/components/views/ContradictionView.tsx`
**Changes**: Create contradiction management interface

```typescript
export function ContradictionView({ engagement, serverUrl, authToken }: ContradictionViewProps): React.ReactElement {
  const { contradictions, loading, refresh } = useContradictions(serverUrl, authToken, engagement.id);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showResolved, setShowResolved] = useState(false);
  const [resolutionMode, setResolutionMode] = useState(false);

  const filtered = contradictions.filter(c =>
    showResolved || c.status === 'unresolved'
  );

  useInput((input, key) => {
    if (resolutionMode) {
      // Handle resolution input
      if (key.escape) setResolutionMode(false);
      if (input === 'e' || input === 'E') markExplained();
      if (input === 'd' || input === 'D') markDismissed();
    } else {
      // Navigation
      if (key.upArrow) navigateUp();
      if (key.downArrow) navigateDown();
      if (key.return) setResolutionMode(true);
      if (input === 'r' || input === 'R') toggleShowResolved();
    }
  });

  return (
    <Box flexDirection="column">
      <ContradictionList
        contradictions={filtered}
        selectedIndex={selectedIndex}
        severityColors={true}
      />
      {resolutionMode && (
        <ResolutionDialog
          contradiction={filtered[selectedIndex]}
          onResolve={handleResolve}
          onCancel={() => setResolutionMode(false)}
        />
      )}
    </Box>
  );
}
```

#### 3. Create Stress Test Interface
**File**: `tui-client/src/components/views/StressTestView.tsx`
**Changes**: Stress test execution and monitoring

```typescript
export function StressTestView({ engagement, serverUrl, authToken }: StressTestViewProps): React.ReactElement {
  const [testConfig, setTestConfig] = useState<StressTestConfig>({
    intensity: 'moderate',
    enable_devils_advocate: true,
    contrarian_sources: false
  });
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [testHistory, setTestHistory] = useState<StressTest[]>([]);

  const startTest = async () => {
    const client = new ThesisValidatorClient(serverUrl, authToken);
    const { test_id } = await client.startStressTest(engagement.id, testConfig);
    setRunningTest(test_id);
    // Monitor progress via WebSocket
    monitorTestProgress(test_id);
  };

  return (
    <Box flexDirection="column">
      <Text bold color="red">Stress Test Configuration</Text>

      <Box marginY={1}>
        <Text>Intensity: </Text>
        <SelectInput
          items={['light', 'moderate', 'aggressive']}
          value={testConfig.intensity}
          onSelect={i => setTestConfig({...testConfig, intensity: i})}
        />
      </Box>

      <Box marginY={1}>
        <Text>[✓] Devil's Advocate: {testConfig.enable_devils_advocate ? 'ON' : 'OFF'}</Text>
        <Text>[✓] Contrarian Sources: {testConfig.contrarian_sources ? 'ON' : 'OFF'}</Text>
      </Box>

      {runningTest ? (
        <StressTestProgress testId={runningTest} />
      ) : (
        <Box marginTop={1}>
          <Text color="green">[Enter] Start Test  [H] View History</Text>
        </Box>
      )}
    </Box>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `npm run typecheck`
- [x] Contradiction API endpoints respond correctly
- [x] Stress test initiation returns test ID
- [x] WebSocket connection established for progress

#### Manual Verification:
- [ ] Contradictions display with severity coloring
- [ ] Resolution workflow completes successfully
- [ ] Stress test configuration UI works properly
- [ ] Progress updates display in real-time
- [ ] Test history shows past results

---

## Phase 3: Metrics Dashboard & Monitor Tab

### Overview
Implement research quality metrics visualization and system monitoring capabilities.

### Changes Required:

#### 1. Extend API Client for Metrics
**File**: `tui-client/src/api/client.ts`
**Changes**: Add metrics methods

```typescript
async getMetrics(engagementId: string): Promise<ResearchMetrics> {
  const response = await this.http.get<{ metrics: ResearchMetrics }>(
    `/api/v1/engagements/${engagementId}/metrics`
  );
  return response.data.metrics;
}

async getMetricsHistory(engagementId: string, limit = 100): Promise<MetricsSnapshot[]> {
  const response = await this.http.get<{ history: MetricsSnapshot[] }>(
    `/api/v1/engagements/${engagementId}/metrics/history`,
    { params: { limit } }
  );
  return response.data.history;
}

async calculateMetrics(engagementId: string): Promise<ResearchMetrics> {
  const response = await this.http.post<{ metrics: ResearchMetrics }>(
    `/api/v1/engagements/${engagementId}/metrics/calculate`
  );
  return response.data.metrics;
}
```

#### 2. Implement Monitor Tab
**File**: `tui-client/src/components/tabs/MonitorTab.tsx`
**Changes**: Create metrics dashboard

```typescript
export function MonitorTab({ serverUrl, authToken }: MonitorTabProps): React.ReactElement {
  const [selectedEngagement, setSelectedEngagement] = useState<string | null>(null);
  const { metrics, history, loading } = useMetrics(serverUrl, authToken, selectedEngagement);
  const [refreshInterval] = useState(5000); // 5 second refresh

  // Auto-refresh metrics
  useEffect(() => {
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Research Quality Dashboard</Text>

      {metrics && (
        <>
          <MetricsGauges metrics={metrics} />
          <Box marginY={1}>
            <HistoryChart
              data={history}
              metric="confidence"
              height={10}
            />
          </Box>
          <QualityIndicators metrics={metrics} />
        </>
      )}

      <Box marginTop={1}>
        <Text color="gray">Auto-refresh: {refreshInterval/1000}s</Text>
      </Box>
    </Box>
  );
}

// ASCII gauge component
function MetricsGauges({ metrics }: { metrics: ResearchMetrics }) {
  return (
    <Box flexDirection="column" marginY={1}>
      <GaugeBar
        label="Evidence Credibility"
        value={metrics.evidence_credibility_avg}
        max={1}
        color="green"
      />
      <GaugeBar
        label="Source Diversity"
        value={metrics.source_diversity_score}
        max={1}
        color="blue"
      />
      <GaugeBar
        label="Hypothesis Coverage"
        value={metrics.hypothesis_coverage}
        max={1}
        color="yellow"
      />
      <GaugeBar
        label="Overall Confidence"
        value={metrics.overall_confidence}
        max={100}
        color="cyan"
      />
    </Box>
  );
}
```

#### 3. Create ASCII Visualization Components
**File**: `tui-client/src/components/charts/AsciiCharts.tsx`
**Changes**: Text-based charts for terminal

```typescript
export function GaugeBar({ label, value, max, color }: GaugeBarProps) {
  const percentage = (value / max) * 100;
  const filled = Math.round((percentage / 100) * 20);
  const empty = 20 - filled;

  return (
    <Box>
      <Box width={20}>
        <Text>{label}:</Text>
      </Box>
      <Text color={color}>
        {'█'.repeat(filled)}{'░'.repeat(empty)}
      </Text>
      <Text> {percentage.toFixed(1)}%</Text>
    </Box>
  );
}

export function HistoryChart({ data, metric, height = 10 }: HistoryChartProps) {
  const values = data.map(d => d[metric]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  // Generate ASCII chart
  const chart = generateAsciiLineChart(values, height, range);

  return (
    <Box flexDirection="column">
      {chart.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Text color="gray">└{'─'.repeat(values.length)}</Text>
    </Box>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] Metrics API endpoints respond with correct data
- [x] Auto-refresh timer works without memory leaks
- [x] ASCII charts render correctly
- [x] Type checking passes: `npm run typecheck`

#### Manual Verification:
- [ ] Dashboard displays all 5 core metrics correctly
- [ ] Gauge bars show accurate percentages
- [ ] Sparkline chart updates with new data
- [ ] Auto-refresh updates display smoothly
- [ ] Performance remains good with continuous updates

---

## Phase 4: Document Management & Complete CRUD Operations

### Overview
Complete the remaining features including document upload, full engagement management, and skills integration.

### Changes Required:

#### 1. Add Document Upload Interface
**File**: `tui-client/src/components/forms/DocumentUploadForm.tsx`
**Changes**: File selection and upload

```typescript
export function DocumentUploadForm({ engagementId, serverUrl, authToken, onComplete }: DocumentUploadProps) {
  const [filePath, setFilePath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<string>('data_room');

  const handleUpload = async () => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('document_type', documentType);
    formData.append('extract_evidence', 'true');

    const response = await axios.post(
      `${serverUrl}/api/v1/engagements/${engagementId}/documents`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    // Monitor processing status
    monitorDocumentProcessing(response.data.document.id);
  };

  return (
    <Box flexDirection="column">
      <Text>Upload Document</Text>
      <TextInput
        value={filePath}
        onChange={setFilePath}
        placeholder="Enter file path..."
      />
      <SelectInput
        items={['data_room', 'expert_transcript', 'market_research', 'financial_model']}
        value={documentType}
        onSelect={setDocumentType}
      />
      <Text color={uploading ? 'yellow' : 'green'}>
        {uploading ? 'Uploading...' : '[Enter] Upload  [ESC] Cancel'}
      </Text>
    </Box>
  );
}
```

#### 2. Complete Engagement CRUD
**File**: `tui-client/src/components/tabs/EngagementsTab.tsx`
**Changes**: Add edit and delete functionality

```typescript
// Add to existing component
const handleEditEngagement = async (updates: UpdateEngagementRequest) => {
  try {
    await apiClient.updateEngagement(engagements[selectedIndex].id, updates);
    setMessage('Engagement updated successfully');
    await refresh();
  } catch (err) {
    setMessage(`Error: ${err.message}`);
  }
};

const handleDeleteEngagement = async () => {
  const engagement = engagements[selectedIndex];
  if (await confirmDelete(engagement.name)) {
    try {
      await apiClient.deleteEngagement(engagement.id);
      setMessage('Engagement deleted');
      await refresh();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  }
};

// Add team management
const handleAddTeamMember = async (userId: string, accessLevel: string) => {
  await apiClient.addTeamMember(engagements[selectedIndex].id, {
    user_id: userId,
    access_level: accessLevel
  });
  await refresh();
};
```

#### 3. Add Skills Integration
**File**: `tui-client/src/components/views/SkillsView.tsx`
**Changes**: Skills library browser and execution

```typescript
export function SkillsView({ serverUrl, authToken }: SkillsViewProps) {
  const { skills, loading } = useSkills(serverUrl, authToken);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSkills = skills.filter(skill =>
    (selectedCategory === 'all' || skill.category === selectedCategory) &&
    skill.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const executeSkill = async (skillId: string, parameters: any) => {
    const client = new ThesisValidatorClient(serverUrl, authToken);
    const result = await client.executeSkill(skillId, parameters);
    displayResult(result);
  };

  return (
    <Box flexDirection="column">
      <Text bold>Skills Library ({filteredSkills.length})</Text>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <SkillsList
        skills={filteredSkills}
        onExecute={executeSkill}
      />
    </Box>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] Document upload endpoint accepts multipart data
- [x] File processing status updates correctly
- [x] CRUD operations complete without errors
- [x] Skills API integration works correctly

#### Manual Verification:
- [ ] Document upload works with various file types
- [ ] Processing status displays progress
- [ ] Edit engagement updates all fields properly
- [ ] Delete confirmation prevents accidental deletion
- [ ] Team member management works correctly

---

## Phase 5: Polish & Integration Testing

### Overview
Add finishing touches, error handling, and comprehensive integration tests.

### Changes Required:

#### 1. Add Global Error Handling
**File**: `tui-client/src/context/ErrorContext.tsx`
**Changes**: Centralized error display

```typescript
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setError(new Error(event.message));
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error Occurred:</Text>
        <Text>{error.message}</Text>
        <Text color="gray">[R] Retry  [Q] Quit</Text>
      </Box>
    );
  }

  return <>{children}</>;
}
```

#### 2. Add Integration Tests
**File**: `tui-client/tests/integration.test.ts`
**Changes**: End-to-end workflow tests

```typescript
describe('TUI Integration Tests', () => {
  test('Complete research workflow', async () => {
    // Create engagement
    const engagement = await createTestEngagement();

    // Submit thesis
    await submitThesis(engagement.id, 'Test investment thesis');

    // Start research
    const jobId = await startResearch(engagement.id);

    // Wait for completion
    await waitForJobCompletion(jobId);

    // Verify hypotheses created
    const hypotheses = await getHypotheses(engagement.id);
    expect(hypotheses.length).toBeGreaterThan(0);

    // Verify evidence gathered
    const evidence = await getEvidence(engagement.id);
    expect(evidence.length).toBeGreaterThan(0);
  });

  test('Stress test execution', async () => {
    // Run stress test
    const testId = await startStressTest(engagementId, {
      intensity: 'moderate',
      enable_devils_advocate: true
    });

    // Wait for completion
    await waitForTestCompletion(testId);

    // Verify contradictions found
    const contradictions = await getContradictions(engagementId);
    expect(contradictions.length).toBeGreaterThan(0);
  });
});
```

#### 3. Add Help System
**File**: `tui-client/src/components/HelpView.tsx`
**Changes**: Context-sensitive help

```typescript
export function HelpView({ context }: { context: string }) {
  const helpContent = getHelpForContext(context);

  return (
    <Box flexDirection="column" padding={1} borderStyle="double">
      <Text bold color="cyan">Help - {context}</Text>
      <Box marginY={1}>
        {helpContent.map((item, i) => (
          <Box key={i}>
            <Text color="yellow">{item.key}</Text>
            <Text> - {item.description}</Text>
          </Box>
        ))}
      </Box>
      <Text color="gray">[ESC] Close Help</Text>
    </Box>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All integration tests pass: `npm test`
- [ ] Error boundary catches and displays errors
- [ ] Help system shows correct content for each context
- [ ] No TypeScript errors: `npm run typecheck`
- [ ] No linting issues: `npm run lint`

#### Manual Verification:
- [ ] Complete workflow from engagement creation to report generation works
- [ ] All keyboard shortcuts work consistently
- [ ] Error messages are helpful and actionable
- [ ] Help is accessible from every screen
- [ ] Performance is good with large datasets

---

## Testing Strategy

### Unit Tests:
- API client method tests
- Component rendering tests
- Hook behavior tests
- Utility function tests

### Integration Tests:
- Complete workflow scenarios
- API error handling
- WebSocket connection resilience
- Multi-tab navigation

### Manual Testing Steps:
1. Create new engagement and verify all fields saved
2. Submit thesis and run research workflow
3. Navigate hypothesis tree and expand/collapse nodes
4. Filter and search evidence
5. Link evidence to hypotheses
6. View and resolve contradictions
7. Execute stress test with different intensities
8. Monitor metrics dashboard updates
9. Upload and process documents
10. Test all keyboard shortcuts

## Performance Considerations

- Virtualize long lists (100+ items) for smooth scrolling
- Debounce search inputs to reduce API calls
- Cache frequently accessed data (hypotheses, evidence)
- Use WebSocket for real-time updates instead of polling
- Implement pagination for large result sets

## Migration Notes

- No data migration needed (backward compatible)
- Existing TUI installations will get new features automatically
- Token authentication remains unchanged
- All new features are additive, no breaking changes

## References

- Original research: `thesis-validator/thoughts/shared/research/2025-12-08-tui-backend-coverage.md`
- Backend API routes: `thesis-validator/src/api/routes/`
- TUI design plans: `docs/plans/2025-12-04-tui-client-design.md`
- Backend E2E tests: `thesis-validator/tests/e2e-slice*.test.ts`