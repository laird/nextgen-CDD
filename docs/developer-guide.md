# Developer Onboarding Guide

**Last Updated:** 2025-12-18

Welcome to the Thesis Validator project! This guide will help you get oriented and productive quickly.

## Table of Contents

- [Quick Start Checklist](#quick-start-checklist)
- [Recommended First Steps](#recommended-first-steps)
- [Project Navigation](#project-navigation)
- [Development Workflow](#development-workflow)
- [Key Concepts](#key-concepts)
- [Common Tasks](#common-tasks)
- [Code Patterns](#code-patterns)
- [Testing Guide](#testing-guide)
- [Debugging Tips](#debugging-tips)
- [Getting Help](#getting-help)

---

## Quick Start Checklist

Complete these items in order:

- [ ] Read the [main README](../README.md) for project overview
- [ ] Set up local development environment ([local-deployment.md](local-deployment.md))
- [ ] Get API keys (Anthropic, OpenAI, Tavily)
- [ ] Run the application locally
- [ ] Create a test engagement and run research
- [ ] Read the [architecture document](architecture.md)
- [ ] Review the [CLAUDE.md](../CLAUDE.md) coding conventions

---

## Recommended First Steps

### Day 1: Environment Setup

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/your-org/nextgen-CDD.git
   cd nextgen-CDD/thesis-validator
   npm install
   ```

2. **Start infrastructure**
   ```bash
   docker-compose up -d redis postgres
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Add your API keys
   ```

4. **Initialize database**
   ```bash
   npm run db:init
   npm run db:schema    # First time only
   npm run db:migrate
   npm run seed:skills
   ```

5. **Start the backend**
   ```bash
   npm run dev
   # Verify: curl http://localhost:3000/health
   ```

6. **Start the frontend** (new terminal)
   ```bash
   cd dashboard-ui
   npm install
   npm run dev
   # Open: http://localhost:5173
   ```

### Day 2: Explore the Application

1. **Create your first engagement**
   - Open the dashboard at http://localhost:5173
   - Click "New Engagement"
   - Enter a company name and investment thesis
   - Submit and start research

2. **Watch the research workflow**
   - Observe the progress updates
   - See hypotheses being generated
   - Watch evidence being gathered

3. **Explore the codebase**
   - Start with `src/api/routes/` to see API endpoints
   - Look at `src/agents/` to understand agent implementations
   - Review `src/workflows/` for orchestration logic

### Day 3: Make Your First Change

1. **Run the tests**
   ```bash
   npm test
   ```

2. **Make a small change** (e.g., add a log message)

3. **Verify your change works**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

4. **Commit and push**
   ```bash
   git checkout -b feature/your-change
   git commit -m "feat: your change description"
   git push origin feature/your-change
   ```

---

## Project Navigation

### Directory Structure

```
nextgen-CDD/
├── thesis-validator/           # Backend API & AI agents
│   ├── src/
│   │   ├── agents/             # AI agents (start here for AI logic)
│   │   │   ├── base-agent.ts   # Base class all agents extend
│   │   │   ├── conductor.ts    # Workflow orchestrator
│   │   │   ├── hypothesis-builder.ts
│   │   │   ├── evidence-gatherer.ts
│   │   │   ├── contradiction-hunter.ts
│   │   │   ├── comparables-finder.ts
│   │   │   └── expert-synthesizer.ts
│   │   ├── api/                # Fastify REST & WebSocket
│   │   │   └── routes/         # Route handlers by resource
│   │   ├── config/             # Environment configuration
│   │   ├── memory/             # Vector memory systems
│   │   ├── models/             # Zod schemas
│   │   ├── repositories/       # Database access layer
│   │   ├── services/           # LLM, auth, job queue
│   │   ├── tools/              # External integrations
│   │   ├── workers/            # BullMQ background workers
│   │   └── workflows/          # Multi-phase workflows
│   ├── tests/                  # Vitest tests
│   └── migrations/             # Database migrations
├── dashboard-ui/               # React frontend
│   └── src/
│       ├── components/         # React components
│       ├── pages/              # Page components
│       └── hooks/              # Custom React hooks
├── tui-client/                 # Terminal UI client
└── docs/                       # Documentation
    ├── deployment.md           # GCP deployment
    ├── local-deployment.md     # Local setup
    ├── architecture.md         # Design decisions
    └── plans/                  # Historical design docs
```

### Key Files to Know

| File | Purpose |
|------|---------|
| `src/index.ts` | Application entry point |
| `src/config/index.ts` | Environment configuration |
| `src/agents/base-agent.ts` | Base class for all AI agents |
| `src/services/llm-provider.ts` | LLM abstraction layer |
| `src/workflows/research-workflow.ts` | Main research orchestration |
| `src/workers/research-worker.ts` | BullMQ worker for research jobs |
| `src/api/routes/engagement-routes.ts` | Core engagement API |

---

## Development Workflow

### Starting Development

```bash
# Terminal 1: Infrastructure
cd thesis-validator && docker-compose up -d redis postgres

# Terminal 2: Backend (with hot reload)
cd thesis-validator && npm run dev

# Terminal 3: Frontend (with hot reload)
cd dashboard-ui && npm run dev
```

### Before Committing

```bash
cd thesis-validator
npm run typecheck  # Type checking
npm run lint       # Linting
npm test           # Tests
```

### Git Workflow

1. Create a feature branch from `main`
2. Make changes with atomic commits
3. Push and create a pull request
4. Request review
5. Merge after approval

### Commit Message Format

Follow conventional commits:
```
feat: add new hypothesis confidence scoring
fix: resolve database connection timeout
docs: update deployment guide
refactor: simplify evidence gathering logic
test: add tests for contradiction hunter
```

---

## Key Concepts

### Engagements

An **engagement** is a due diligence project for a specific company/deal. It contains:
- Target company information
- Investment thesis
- Generated hypotheses
- Collected evidence
- Detected contradictions
- Research metrics

### Hypotheses

**Hypotheses** are testable claims derived from the investment thesis. They form a tree structure:
- Root hypotheses (top-level claims)
- Sub-hypotheses (supporting claims)
- Each has a confidence score (0-100%)

### Evidence

**Evidence** items support or contradict hypotheses:
- Source type (web, document, expert)
- Credibility score
- Sentiment (supporting, contradicting, neutral)
- Links to hypotheses

### Research Workflow

The **research workflow** is a multi-phase process:
1. **Phase 1**: Build hypothesis tree from thesis
2. **Phase 2**: Find comparable deals
3. **Phase 3**: Gather evidence (skills + web search)
4. **Phase 4**: Hunt for contradictions

### Skills

**Skills** are reusable analytical patterns:
- Market sizing (TAM/SAM/SOM)
- Competitive analysis
- Financial modeling
- Each skill has parameters and templates

---

## Common Tasks

### Adding a New API Endpoint

1. Define the schema in `src/models/`
2. Add the route in `src/api/routes/`
3. Implement repository methods if needed
4. Add tests

Example:
```typescript
// src/api/routes/my-route.ts
import { FastifyPluginAsync } from 'fastify';
import { MyInputSchema, MyOutputSchema } from '@models/my-schema.js';

const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/v1/my-endpoint', {
    schema: {
      body: MyInputSchema,
      response: { 200: MyOutputSchema }
    }
  }, async (request, reply) => {
    // Implementation
  });
};

export default myRoutes;
```

### Adding a New Agent

1. Create a new file in `src/agents/`
2. Extend `BaseAgent`
3. Implement the `execute()` method
4. Register with the Conductor if needed

Example:
```typescript
// src/agents/my-agent.ts
import { BaseAgent, AgentResult } from './base-agent.js';

interface MyInput {
  engagementId: string;
  // ...
}

interface MyOutput {
  findings: string[];
}

export class MyAgent extends BaseAgent<MyInput, MyOutput> {
  async execute(input: MyInput): Promise<AgentResult<MyOutput>> {
    try {
      const response = await this.callLLM(`Your prompt here...`);

      return {
        success: true,
        data: { findings: [response] }
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error.message, code: 'MY_AGENT_ERROR' }
      };
    }
  }
}
```

### Adding a Database Migration

1. Create a migration file in `migrations/`
2. Run the migration

```bash
# Create migration file
cat > migrations/002_add_my_column.sql << 'EOF'
ALTER TABLE hypotheses ADD COLUMN my_column TEXT;
EOF

# Run migration
npm run db:migrate
```

### Debugging a Research Workflow

1. **Check logs**
   ```bash
   # In development
   # Logs appear in the terminal running npm run dev

   # In Cloud Run
   gcloud run services logs read thesis-validator --region=us-central1
   ```

2. **Check job status in Redis**
   ```bash
   redis-cli
   > KEYS bull:research-jobs:*
   > GET bull:research-jobs:active
   ```

3. **Add debug logging**
   ```typescript
   this.logger.debug('Processing hypothesis', { id, data });
   ```

---

## Code Patterns

### Schema-First Development

Always define Zod schemas for data structures:

```typescript
// src/models/my-schema.ts
import { z } from 'zod';

export const MySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  status: z.enum(['pending', 'active', 'completed']),
  metadata: z.record(z.unknown()).optional(),
});

export type MyType = z.infer<typeof MySchema>;
```

### Repository Pattern

```typescript
// src/repositories/my-repository.ts
export class MyRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<MyType | null> {
    const result = await this.pool.query(
      'SELECT * FROM my_table WHERE id = $1',
      [id]
    );
    return result.rows[0] ?? null;
  }
}
```

### Error Handling in Agents

Always return `AgentResult` instead of throwing:

```typescript
async execute(input: Input): Promise<AgentResult<Output>> {
  try {
    // ... implementation
    return { success: true, data: result };
  } catch (error) {
    this.logger.error('Agent failed', { error });
    return {
      success: false,
      error: {
        message: error.message,
        code: 'AGENT_EXECUTION_ERROR',
        details: { input }
      }
    };
  }
}
```

### TypeScript Best Practices

```typescript
// Always use .js extension in imports (ESM requirement)
import { Something } from './something.js';

// Handle possible undefined (noUncheckedIndexedAccess)
const items = array[0];  // Type is T | undefined
if (items) {
  // Now items is T
}

// Use exact optional properties
interface Config {
  name: string;
  debug?: boolean;  // Must be boolean if present, not undefined
}
```

---

## Testing Guide

### Running Tests

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/agents/hypothesis-builder.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    const input = { ... };

    // Act
    const result = await myFunction(input);

    // Assert
    expect(result).toEqual(expected);
  });
});
```

### Mocking Patterns

```typescript
// Mock a module
vi.mock('@services/llm-provider.js', () => ({
  getLLMProvider: vi.fn(() => ({
    chat: vi.fn().mockResolvedValue('mocked response')
  }))
}));

// Mock a repository
const mockRepo = {
  findById: vi.fn().mockResolvedValue({ id: '123', name: 'Test' }),
  create: vi.fn().mockResolvedValue({ id: '456' }),
};
```

---

## Debugging Tips

### Common Issues

| Problem | Solution |
|---------|----------|
| `Module not found` | Check `.js` extension in imports |
| `Cannot find type` | Run `npm run typecheck` to see full errors |
| Database connection fails | Check Docker is running: `docker-compose ps` |
| LLM calls timeout | Check API key and rate limits |
| Jobs stay queued | Ensure workers are running (check logs) |

### Useful Debug Commands

```bash
# Check TypeScript errors
npm run typecheck

# Check linting issues
npm run lint

# View Docker container logs
docker-compose logs -f redis
docker-compose logs -f postgres

# Connect to PostgreSQL
docker exec -it thesis-validator-postgres-1 psql -U thesis_validator

# Connect to Redis
docker exec -it thesis-validator-redis-1 redis-cli

# View BullMQ queues
redis-cli KEYS "bull:*"
```

### Adding Debug Logging

```typescript
// Use the logger (not console.log)
this.logger.debug('Starting process', { input });
this.logger.info('Process completed', { result });
this.logger.warn('Unexpected state', { state });
this.logger.error('Process failed', { error });
```

---

## Getting Help

### Resources

- **Documentation**: This `docs/` folder
- **Architecture**: [architecture.md](architecture.md)
- **API Reference**: [main README](../README.md)
- **Deployment**: [deployment.md](deployment.md) and [local-deployment.md](local-deployment.md)

### Team Contacts

For help with specific areas:
- **Backend/Agents**: Check `src/agents/` comments and tests
- **Frontend**: Check `dashboard-ui/` component documentation
- **Deployment**: Check deployment guides and Cloud Build configs

### Common Questions

**Q: How do I add a new LLM provider?**
A: See `src/services/llm-provider.ts` and follow the pattern for existing providers.

**Q: How do I add a new skill?**
A: Add to the skills seed data and create corresponding templates.

**Q: How do I test against production-like data?**
A: Use the `npm run seed:skills` command and create test engagements.

**Q: Where are the database schemas?**
A: See `thesis-validator/docs/inferred-schema.md` and `migrations/` folder.

---

## Next Steps

After completing onboarding:

1. Pick a task from the backlog
2. Create a feature branch
3. Implement with tests
4. Create a pull request
5. Get code review

Welcome to the team!
