# TUI Client Phase 1 (MVP) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build core infrastructure for Terminal User Interface client with basic project setup, API client, tab navigation, and minimal Engagements tab.

**Architecture:** Standalone Node.js application using ink (React for CLIs) that connects to Thesis Validator API at http://localhost:3000. Tab-based navigation with shared state context for selected engagement.

**Tech Stack:** TypeScript, ink v4, axios, chalk, commander, vitest

---

## Task 1: Project Setup

**Files:**
- Create: `tui-client/package.json`
- Create: `tui-client/tsconfig.json`
- Create: `tui-client/.gitignore`
- Create: `tui-client/README.md`

**Step 1: Create tui-client directory**

```bash
cd /home/VU265EC/dev/nextgen-CDD
mkdir -p tui-client
cd tui-client
```

**Step 2: Initialize npm project**

```bash
npm init -y
```

**Step 3: Install dependencies**

```bash
npm install ink@^4.4.1 react@^18.2.0 axios@^1.6.0 chalk@^5.3.0 commander@^11.1.0
npm install -D typescript@^5.3.0 @types/node@^20.10.0 @types/react@^18.2.0 vitest@^1.0.0 tsx@^4.7.0 @types/ink@^4.0.0
```

**Step 4: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "jsx": "react",
    "jsxImportSource": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

**Step 5: Create .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
*.log
.DS_Store
.env
.env.local
coverage/
.vscode/
.idea/
```

**Step 6: Update package.json scripts**

Modify `package.json` to add:

```json
{
  "name": "thesis-validator-tui",
  "version": "1.0.0",
  "description": "Terminal UI client for Thesis Validator",
  "type": "module",
  "bin": {
    "thesis-tui": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx watch src/index.tsx",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:watch": "vitest watch",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["tui", "cli", "thesis-validator"],
  "author": "",
  "license": "MIT"
}
```

**Step 7: Create basic README**

Create `README.md`:

```markdown
# Thesis Validator TUI Client

Terminal User Interface client for the Thesis Validator application.

## Installation

\`\`\`bash
npm install
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
npm start
\`\`\`

## Usage

\`\`\`bash
npm start                          # Connect to localhost:3000
npm start -- --server=api.prod.com # Connect to remote server
\`\`\`

## Architecture

Standalone client that connects to Thesis Validator API via:
- REST endpoints (axios)
- WebSocket connections (ws)

Built with ink (React for CLIs) for component-based UI.
```

**Step 8: Verify setup**

```bash
npm run typecheck
```

Expected: "Found 0 errors"

**Step 9: Commit**

```bash
git add tui-client/
git commit -m "feat(tui): initialize tui-client project with TypeScript and ink"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `tui-client/src/types/api.ts`

**Step 1: Create types directory**

```bash
mkdir -p src/types
```

**Step 2: Define API types**

Create `src/types/api.ts`:

```typescript
/**
 * API Types - Shared types for Thesis Validator API
 */

export interface Engagement {
  id: string;
  name: string;
  target: {
    name: string;
    sector: string;
    location?: string;
  };
  deal_type: 'buyout' | 'growth' | 'venture' | 'bolt-on';
  status: 'pending' | 'research_active' | 'research_complete' | 'research_failed' | 'completed';
  thesis?: {
    statement: string;
    submitted_at: number;
  };
  created_at: number;
  updated_at: number;
  created_by: string;
}

export interface EngagementFilters {
  status?: string;
  sector?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEngagementRequest {
  name: string;
  target: {
    name: string;
    sector: string;
    location?: string;
  };
  deal_type: 'buyout' | 'growth' | 'venture' | 'bolt-on';
  thesis_statement?: string;
}

export interface UpdateEngagementRequest {
  name?: string;
  target?: {
    name?: string;
    sector?: string;
    location?: string;
  };
  status?: Engagement['status'];
  thesis_statement?: string;
}

export interface ResearchJob {
  id: string;
  engagement_id: string;
  type: 'research' | 'stress_test';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  started_at: number;
  completed_at?: number;
  error?: string;
  result?: unknown;
}

export interface ResearchConfig {
  depth: 'quick' | 'standard' | 'deep';
  focus_areas?: string[];
  include_comparables?: boolean;
  max_sources?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
}

export interface SystemMetrics {
  timestamp: number;
  websocket: {
    total_connections: number;
    connections_by_engagement: Record<string, number>;
  };
  expert_calls: {
    active_sessions: number;
    sessions: Array<{
      session_id: string;
      engagement_id: string;
      user_id: string;
      started_at: number;
      chunks_processed: number;
    }>;
  };
  memory: {
    heap_used: number;
    heap_total: number;
    rss: number;
  };
  uptime: number;
}

export interface APIError {
  error: string;
  message: string;
  details?: unknown;
}
```

**Step 3: Verify types compile**

```bash
npm run typecheck
```

Expected: "Found 0 errors"

**Step 4: Commit**

```bash
git add src/types/
git commit -m "feat(tui): add TypeScript types for API integration"
```

---

## Task 3: API Client

**Files:**
- Create: `tui-client/src/api/client.ts`
- Create: `tui-client/src/api/client.test.ts`

**Step 1: Write the failing test**

Create `src/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThesisValidatorClient } from './client.js';
import type { Engagement, HealthStatus } from '../types/api.js';

describe('ThesisValidatorClient', () => {
  let client: ThesisValidatorClient;

  beforeEach(() => {
    client = new ThesisValidatorClient('http://localhost:3000');
  });

  it('should create client with base URL', () => {
    expect(client).toBeDefined();
    expect(client.baseURL).toBe('http://localhost:3000');
  });

  it('should fetch health status', async () => {
    // Mock axios
    const mockGet = vi.fn().mockResolvedValue({
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        version: '1.0.0'
      }
    });

    // Replace axios with mock
    vi.mock('axios', () => ({
      default: {
        create: () => ({
          get: mockGet
        })
      }
    }));

    const health = await client.getHealth();

    expect(health.status).toBe('healthy');
    expect(health.version).toBe('1.0.0');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test src/api/client.test.ts
```

Expected: FAIL with "Cannot find module './client.js'"

**Step 3: Write minimal implementation**

Create `src/api/client.ts`:

```typescript
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

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.http = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
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
```

**Step 4: Update test with proper mocking**

Update `src/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { ThesisValidatorClient } from './client.js';

vi.mock('axios');

describe('ThesisValidatorClient', () => {
  let client: ThesisValidatorClient;
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
    client = new ThesisValidatorClient('http://localhost:3000');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create client with base URL', () => {
    expect(client).toBeDefined();
    expect(client.baseURL).toBe('http://localhost:3000');
  });

  it('should fetch health status', async () => {
    const mockHealth = {
      status: 'healthy' as const,
      timestamp: Date.now(),
      version: '1.0.0',
    };

    mockAxiosInstance.get.mockResolvedValueOnce({ data: mockHealth });

    const health = await client.getHealth();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    expect(health.status).toBe('healthy');
    expect(health.version).toBe('1.0.0');
  });

  it('should fetch engagements', async () => {
    const mockEngagements = [
      {
        id: 'eng-1',
        name: 'Test Deal',
        target: { name: 'TechCo', sector: 'Software' },
        deal_type: 'buyout' as const,
        status: 'pending' as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by: 'user-1',
      },
    ];

    mockAxiosInstance.get.mockResolvedValueOnce({
      data: { engagements: mockEngagements },
    });

    const engagements = await client.getEngagements();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/engagements', {
      params: undefined,
    });
    expect(engagements).toHaveLength(1);
    expect(engagements[0]?.name).toBe('Test Deal');
  });
});
```

**Step 5: Run test to verify it passes**

```bash
npm test src/api/client.test.ts
```

Expected: PASS (all tests passing)

**Step 6: Commit**

```bash
git add src/api/
git commit -m "feat(tui): add API client with axios and basic endpoints"
```

---

## Task 4: Basic App Structure

**Files:**
- Create: `tui-client/src/App.tsx`
- Create: `tui-client/src/index.tsx`

**Step 1: Create App component**

Create `src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';

interface AppProps {
  serverUrl: string;
}

export function App({ serverUrl }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="blue" paddingX={1}>
        <Text bold>Thesis Validator TUI</Text>
        <Text> | </Text>
        <Text color="gray">Server: {serverUrl}</Text>
        <Text> | </Text>
        <Text color="green">✓ Online</Text>
      </Box>

      {/* Tab Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={activeTab === 0 ? 'cyan' : 'gray'}>[1] Engagements</Text>
        <Text>  </Text>
        <Text color={activeTab === 1 ? 'cyan' : 'gray'}>[2] Research</Text>
        <Text>  </Text>
        <Text color={activeTab === 2 ? 'cyan' : 'gray'}>[3] Evidence</Text>
        <Text>  </Text>
        <Text color={activeTab === 3 ? 'cyan' : 'gray'}>[4] Hypothesis</Text>
        <Text>  </Text>
        <Text color={activeTab === 4 ? 'cyan' : 'gray'}>[5] Monitor</Text>
        <Text>  </Text>
        <Text color="red">[Q] Quit</Text>
      </Box>

      {/* Content Area */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {activeTab === 0 && <Text>Engagements Tab - Coming Soon</Text>}
        {activeTab === 1 && <Text>Research Tab - Coming Soon</Text>}
        {activeTab === 2 && <Text>Evidence Tab - Coming Soon</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab - Coming Soon</Text>}
        {activeTab === 4 && <Text>Monitor Tab - Coming Soon</Text>}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ↑↓: Navigate  Enter: Select  /: Search  ?: Help
        </Text>
      </Box>
    </Box>
  );
}
```

**Step 2: Create entry point**

Create `src/index.tsx`:

```tsx
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './App.js';

const program = new Command();

program
  .name('thesis-tui')
  .description('Terminal UI for Thesis Validator')
  .version('1.0.0')
  .option('-s, --server <url>', 'API server URL', 'http://localhost:3000')
  .parse();

const options = program.opts<{ server: string }>();

render(<App serverUrl={options.server} />);
```

**Step 3: Test the app manually**

```bash
npm run dev
```

Expected: TUI renders with header, tabs, and footer. Can see placeholder text.

Press `Ctrl+C` to exit.

**Step 4: Commit**

```bash
git add src/App.tsx src/index.tsx
git commit -m "feat(tui): add basic app structure with header, tabs, and footer"
```

---

## Task 5: Tab Navigation with Keyboard Input

**Files:**
- Modify: `tui-client/src/App.tsx`

**Step 1: Add useInput hook for keyboard handling**

Update `src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

interface AppProps {
  serverUrl: string;
}

export function App({ serverUrl }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const { exit } = useApp();

  // Handle keyboard input
  useInput((input, key) => {
    // Tab switching
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === '5') setActiveTab(4);

    // Quit
    if (input === 'q' || input === 'Q') {
      exit();
    }

    // Ctrl+C also quits
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="blue" paddingX={1}>
        <Text bold>Thesis Validator TUI</Text>
        <Text> | </Text>
        <Text color="gray">Server: {serverUrl}</Text>
        <Text> | </Text>
        <Text color="green">✓ Online</Text>
      </Box>

      {/* Tab Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={activeTab === 0 ? 'cyan' : 'gray'}>[1] Engagements</Text>
        <Text>  </Text>
        <Text color={activeTab === 1 ? 'cyan' : 'gray'}>[2] Research</Text>
        <Text>  </Text>
        <Text color={activeTab === 2 ? 'cyan' : 'gray'}>[3] Evidence</Text>
        <Text>  </Text>
        <Text color={activeTab === 3 ? 'cyan' : 'gray'}>[4] Hypothesis</Text>
        <Text>  </Text>
        <Text color={activeTab === 4 ? 'cyan' : 'gray'}>[5] Monitor</Text>
        <Text>  </Text>
        <Text color="red">[Q] Quit</Text>
      </Box>

      {/* Content Area */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {activeTab === 0 && <Text>Engagements Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 1 && <Text>Research Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 2 && <Text>Evidence Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab - Press 1-5 to switch tabs</Text>}
        {activeTab === 4 && <Text>Monitor Tab - Press 1-5 to switch tabs</Text>}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          1-5: Switch Tabs  Q: Quit  ?: Help
        </Text>
      </Box>
    </Box>
  );
}
```

**Step 2: Test tab switching**

```bash
npm run dev
```

Expected:
- Press 1-5 to switch tabs
- Active tab highlighted in cyan
- Content area changes based on tab
- Press Q to quit

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(tui): add keyboard navigation for tab switching"
```

---

## Task 6: Header Component with Connection Status

**Files:**
- Create: `tui-client/src/components/Header.tsx`
- Modify: `tui-client/src/App.tsx`

**Step 1: Create Header component**

```bash
mkdir -p src/components
```

Create `src/components/Header.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  serverUrl: string;
  isOnline: boolean;
}

export function Header({ serverUrl, isOnline }: HeaderProps): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1}>
      <Text bold>Thesis Validator TUI</Text>
      <Text> | </Text>
      <Text color="gray">Server: {serverUrl}</Text>
      <Text> | </Text>
      {isOnline ? (
        <Text color="green">✓ Online</Text>
      ) : (
        <Text color="red">✗ Offline</Text>
      )}
    </Box>
  );
}
```

**Step 2: Update App to use Header component**

Update `src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';

interface AppProps {
  serverUrl: string;
}

export function App({ serverUrl }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const [isOnline, setIsOnline] = useState(true); // Will be dynamic later
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === '5') setActiveTab(4);

    if (input === 'q' || input === 'Q') {
      exit();
    }

    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Header serverUrl={serverUrl} isOnline={isOnline} />

      {/* Tab Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={activeTab === 0 ? 'cyan' : 'gray'}>[1] Engagements</Text>
        <Text>  </Text>
        <Text color={activeTab === 1 ? 'cyan' : 'gray'}>[2] Research</Text>
        <Text>  </Text>
        <Text color={activeTab === 2 ? 'cyan' : 'gray'}>[3] Evidence</Text>
        <Text>  </Text>
        <Text color={activeTab === 3 ? 'cyan' : 'gray'}>[4] Hypothesis</Text>
        <Text>  </Text>
        <Text color={activeTab === 4 ? 'cyan' : 'gray'}>[5] Monitor</Text>
        <Text>  </Text>
        <Text color="red">[Q] Quit</Text>
      </Box>

      {/* Content Area */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {activeTab === 0 && <Text>Engagements Tab</Text>}
        {activeTab === 1 && <Text>Research Tab</Text>}
        {activeTab === 2 && <Text>Evidence Tab</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab</Text>}
        {activeTab === 4 && <Text>Monitor Tab</Text>}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          1-5: Switch Tabs  Q: Quit  ?: Help
        </Text>
      </Box>
    </Box>
  );
}
```

**Step 3: Test Header component**

```bash
npm run dev
```

Expected: Header displays with server URL and online status (green checkmark)

**Step 4: Commit**

```bash
git add src/components/ src/App.tsx
git commit -m "feat(tui): extract Header component with connection status"
```

---

## Task 7: Footer Component

**Files:**
- Create: `tui-client/src/components/Footer.tsx`
- Modify: `tui-client/src/App.tsx`

**Step 1: Create Footer component**

Create `src/components/Footer.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface FooterProps {
  helpText?: string;
}

export function Footer({ helpText }: FooterProps): React.ReactElement {
  const defaultHelp = '1-5: Switch Tabs  Q: Quit  ?: Help';

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="gray">{helpText ?? defaultHelp}</Text>
    </Box>
  );
}
```

**Step 2: Update App to use Footer component**

Update `src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';

interface AppProps {
  serverUrl: string;
}

export function App({ serverUrl }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === '5') setActiveTab(4);

    if (input === 'q' || input === 'Q') {
      exit();
    }

    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  // Tab-specific help text
  const getHelpText = (): string => {
    switch (activeTab) {
      case 0:
        return '↑↓: Navigate  Enter: Details  N: New  E: Edit  D: Delete';
      case 1:
        return 'R: New Research  S: Stress Test  Enter: View Results';
      case 2:
        return 'F: Filter  /: Search  Enter: Details  C: Clear';
      case 3:
        return 'Enter: Expand/Collapse  V: View Details  E: Evidence';
      case 4:
        return 'Auto-refresh: 5s';
      default:
        return '1-5: Switch Tabs  Q: Quit  ?: Help';
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Header serverUrl={serverUrl} isOnline={isOnline} />

      {/* Tab Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={activeTab === 0 ? 'cyan' : 'gray'}>[1] Engagements</Text>
        <Text>  </Text>
        <Text color={activeTab === 1 ? 'cyan' : 'gray'}>[2] Research</Text>
        <Text>  </Text>
        <Text color={activeTab === 2 ? 'cyan' : 'gray'}>[3] Evidence</Text>
        <Text>  </Text>
        <Text color={activeTab === 3 ? 'cyan' : 'gray'}>[4] Hypothesis</Text>
        <Text>  </Text>
        <Text color={activeTab === 4 ? 'cyan' : 'gray'}>[5] Monitor</Text>
        <Text>  </Text>
        <Text color="red">[Q] Quit</Text>
      </Box>

      {/* Content Area */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {activeTab === 0 && <Text>Engagements Tab</Text>}
        {activeTab === 1 && <Text>Research Tab</Text>}
        {activeTab === 2 && <Text>Evidence Tab</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab</Text>}
        {activeTab === 4 && <Text>Monitor Tab</Text>}
      </Box>

      <Footer helpText={getHelpText()} />
    </Box>
  );
}
```

**Step 3: Test Footer with dynamic help text**

```bash
npm run dev
```

Expected:
- Footer shows tab-specific help text
- Help text changes when switching tabs (press 1-5)

**Step 4: Commit**

```bash
git add src/components/Footer.tsx src/App.tsx
git commit -m "feat(tui): add Footer component with dynamic help text"
```

---

## Task 8: Basic Engagements Tab

**Files:**
- Create: `tui-client/src/components/tabs/EngagementsTab.tsx`
- Modify: `tui-client/src/App.tsx`

**Step 1: Create EngagementsTab component**

```bash
mkdir -p src/components/tabs
```

Create `src/components/tabs/EngagementsTab.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Engagement } from '../../types/api.js';

interface EngagementsTabProps {
  serverUrl: string;
}

export function EngagementsTab({ serverUrl }: EngagementsTabProps): React.ReactElement {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate loading for now
    const timer = setTimeout(() => {
      setLoading(false);
      // Mock data for now
      setEngagements([
        {
          id: 'eng-1',
          name: 'Series A Due Diligence',
          target: {
            name: 'TechCo Inc',
            sector: 'Software',
          },
          deal_type: 'growth',
          status: 'research_active',
          created_at: Date.now() - 86400000,
          updated_at: Date.now(),
          created_by: 'user-1',
        },
        {
          id: 'eng-2',
          name: 'Growth Equity',
          target: {
            name: 'MedDevice',
            sector: 'Healthcare',
          },
          deal_type: 'growth',
          status: 'pending',
          created_at: Date.now() - 172800000,
          updated_at: Date.now() - 172800000,
          created_by: 'user-1',
        },
      ]);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <Box>
        <Text>Loading engagements...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">⚠ Error: {error}</Text>
      </Box>
    );
  }

  if (engagements.length === 0) {
    return (
      <Box>
        <Text color="gray">No engagements found. Press [N] to create one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold>Engagements</Text>
      </Box>

      {/* Table Header */}
      <Box paddingX={1}>
        <Box width={30}>
          <Text bold>Name</Text>
        </Box>
        <Box width={20}>
          <Text bold>Target</Text>
        </Box>
        <Box width={15}>
          <Text bold>Status</Text>
        </Box>
        <Box width={12}>
          <Text bold>Created</Text>
        </Box>
      </Box>

      {/* Table Rows */}
      {engagements.map((engagement, index) => (
        <Box key={engagement.id} paddingX={1}>
          <Box width={30}>
            <Text color={index === 0 ? 'cyan' : undefined}>
              {index === 0 ? '> ' : '  '}
              {engagement.name}
            </Text>
          </Box>
          <Box width={20}>
            <Text>{engagement.target.name}</Text>
          </Box>
          <Box width={15}>
            <Text color={engagement.status === 'research_active' ? 'yellow' : 'gray'}>
              {engagement.status}
            </Text>
          </Box>
          <Box width={12}>
            <Text>{new Date(engagement.created_at).toLocaleDateString()}</Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1} paddingX={1}>
        <Text color="gray">[N] New  [E] Edit  [D] Delete  [Enter] Details</Text>
      </Box>
    </Box>
  );
}
```

**Step 2: Update App to use EngagementsTab**

Update `src/App.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { EngagementsTab } from './components/tabs/EngagementsTab.js';

interface AppProps {
  serverUrl: string;
}

export function App({ serverUrl }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === '5') setActiveTab(4);

    if (input === 'q' || input === 'Q') {
      exit();
    }

    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const getHelpText = (): string => {
    switch (activeTab) {
      case 0:
        return '↑↓: Navigate  Enter: Details  N: New  E: Edit  D: Delete';
      case 1:
        return 'R: New Research  S: Stress Test  Enter: View Results';
      case 2:
        return 'F: Filter  /: Search  Enter: Details  C: Clear';
      case 3:
        return 'Enter: Expand/Collapse  V: View Details  E: Evidence';
      case 4:
        return 'Auto-refresh: 5s';
      default:
        return '1-5: Switch Tabs  Q: Quit  ?: Help';
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Header serverUrl={serverUrl} isOnline={isOnline} />

      {/* Tab Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={activeTab === 0 ? 'cyan' : 'gray'}>[1] Engagements</Text>
        <Text>  </Text>
        <Text color={activeTab === 1 ? 'cyan' : 'gray'}>[2] Research</Text>
        <Text>  </Text>
        <Text color={activeTab === 2 ? 'cyan' : 'gray'}>[3] Evidence</Text>
        <Text>  </Text>
        <Text color={activeTab === 3 ? 'cyan' : 'gray'}>[4] Hypothesis</Text>
        <Text>  </Text>
        <Text color={activeTab === 4 ? 'cyan' : 'gray'}>[5] Monitor</Text>
        <Text>  </Text>
        <Text color="red">[Q] Quit</Text>
      </Box>

      {/* Content Area */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {activeTab === 0 && <EngagementsTab serverUrl={serverUrl} />}
        {activeTab === 1 && <Text>Research Tab - Coming Soon</Text>}
        {activeTab === 2 && <Text>Evidence Tab - Coming Soon</Text>}
        {activeTab === 3 && <Text>Hypothesis Tab - Coming Soon</Text>}
        {activeTab === 4 && <Text>Monitor Tab - Coming Soon</Text>}
      </Box>

      <Footer helpText={getHelpText()} />
    </Box>
  );
}
```

**Step 3: Test EngagementsTab**

```bash
npm run dev
```

Expected:
- Tab 1 shows engagements table with mock data
- Loading state shows briefly
- Table displays: Name, Target, Status, Created columns
- First row highlighted with cyan ">" marker

**Step 4: Commit**

```bash
git add src/components/tabs/ src/App.tsx
git commit -m "feat(tui): add basic EngagementsTab with mock data and table layout"
```

---

## Task 9: Connect Engagements Tab to Real API

**Files:**
- Modify: `tui-client/src/components/tabs/EngagementsTab.tsx`
- Create: `tui-client/src/hooks/useAPI.ts`

**Step 1: Create useAPI hook**

```bash
mkdir -p src/hooks
```

Create `src/hooks/useAPI.ts`:

```tsx
import { useMemo } from 'react';
import { ThesisValidatorClient } from '../api/client.js';

export function useAPI(serverUrl: string): ThesisValidatorClient {
  return useMemo(() => new ThesisValidatorClient(serverUrl), [serverUrl]);
}
```

**Step 2: Update EngagementsTab to use real API**

Update `src/components/tabs/EngagementsTab.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useAPI } from '../../hooks/useAPI.js';
import type { Engagement } from '../../types/api.js';

interface EngagementsTabProps {
  serverUrl: string;
}

export function EngagementsTab({ serverUrl }: EngagementsTabProps): React.ReactElement {
  const api = useAPI(serverUrl);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadEngagements = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const data = await api.getEngagements();

        if (mounted) {
          setEngagements(data);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load engagements');
          setLoading(false);
        }
      }
    };

    void loadEngagements();

    return () => {
      mounted = false;
    };
  }, [api]);

  if (loading) {
    return (
      <Box>
        <Text>⠋ Loading engagements...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">⚠ Error: {error}</Text>
        <Text color="gray" marginTop={1}>
          Press [R] to retry or check that the server is running at {serverUrl}
        </Text>
      </Box>
    );
  }

  if (engagements.length === 0) {
    return (
      <Box>
        <Text color="gray">No engagements found. Press [N] to create one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold>Engagements ({engagements.length})</Text>
      </Box>

      {/* Table Header */}
      <Box paddingX={1}>
        <Box width={30}>
          <Text bold>Name</Text>
        </Box>
        <Box width={20}>
          <Text bold>Target</Text>
        </Box>
        <Box width={15}>
          <Text bold>Status</Text>
        </Box>
        <Box width={12}>
          <Text bold>Created</Text>
        </Box>
      </Box>

      {/* Table Rows */}
      {engagements.map((engagement, index) => (
        <Box key={engagement.id} paddingX={1}>
          <Box width={30}>
            <Text color={index === 0 ? 'cyan' : undefined}>
              {index === 0 ? '> ' : '  '}
              {engagement.name}
            </Text>
          </Box>
          <Box width={20}>
            <Text>{engagement.target.name}</Text>
          </Box>
          <Box width={15}>
            <Text
              color={
                engagement.status === 'research_active'
                  ? 'yellow'
                  : engagement.status === 'completed'
                  ? 'green'
                  : 'gray'
              }
            >
              {engagement.status}
            </Text>
          </Box>
          <Box width={12}>
            <Text>{new Date(engagement.created_at).toLocaleDateString()}</Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1} paddingX={1}>
        <Text color="gray">[N] New  [E] Edit  [D] Delete  [Enter] Details</Text>
      </Box>
    </Box>
  );
}
```

**Step 3: Test with real API**

Ensure the backend server is running at http://localhost:3000, then:

```bash
npm run dev
```

Expected:
- Shows "Loading engagements..." briefly
- Fetches real data from API
- Displays actual engagements or shows empty state
- If server is offline, shows error with helpful message

**Step 4: Commit**

```bash
git add src/hooks/ src/components/tabs/EngagementsTab.tsx
git commit -m "feat(tui): connect EngagementsTab to real API with useAPI hook"
```

---

## Verification Steps

**Phase 1 MVP is complete. Verify the following:**

1. **Project builds without errors:**
   ```bash
   npm run typecheck
   npm run build
   ```

2. **TUI starts and displays correctly:**
   ```bash
   npm run dev
   ```

3. **Tab navigation works:**
   - Press 1-5 to switch tabs
   - Active tab highlights in cyan
   - Footer shows tab-specific help

4. **Engagements tab loads real data:**
   - Displays actual engagements from API
   - Shows loading state
   - Handles errors gracefully

5. **Keyboard shortcuts work:**
   - Q quits the application
   - Ctrl+C also quits

6. **All tests pass:**
   ```bash
   npm test
   ```

---

## Next Steps

After Phase 1 is complete, continue with:

**Phase 2: Full Engagement Management**
- Add engagement navigation (↑↓ keys)
- Implement create form (N key)
- Implement edit form (E key)
- Implement delete confirmation (D key)
- Add engagement details view (Enter key)
- Add search/filter functionality

**Phase 3: Research Workflows**
- Create Research tab component
- Implement job list view
- Add research workflow form
- Add progress tracking with polling
- Display results view

Refer to the design document at `docs/plans/2025-12-04-tui-client-design.md` for complete feature specifications.
