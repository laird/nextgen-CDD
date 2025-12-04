# CLAUDE.md

This file provides guidance for Claude Code when working with this repository.

## Project Overview

**Thesis Validator** is a multi-agent AI system for private equity commercial and technical due diligence. It validates, pressure-tests, and learns from investment theses using specialized AI agents.

This is a monorepo with two main packages:
- `thesis-validator/` - Backend agentic system (API + agents)
- `dashboard-ui/` - React frontend dashboard

## Architecture

```
thesis-validator/
├── src/
│   ├── agents/          # AI agents (conductor, hypothesis-builder, evidence-gatherer, etc.)
│   ├── api/             # Fastify REST & WebSocket API
│   ├── config/          # Environment configuration
│   ├── memory/          # Vector memory (deal, institutional, market)
│   ├── models/          # Zod schemas and data models
│   ├── services/        # LLM provider abstraction, auth
│   ├── tools/           # External integrations (web search, embedding, doc parser)
│   └── workflows/       # Business workflows (research, stress-test, expert-call)
└── tests/               # Vitest unit tests

dashboard-ui/
└── src/
    ├── components/      # React components
    └── assets/          # Static assets
```

## Tech Stack

### Backend (thesis-validator)
- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode, ESM)
- **Framework**: Fastify 4
- **AI**: Anthropic SDK, Vertex AI (Google Cloud), OpenAI (embeddings)
- **Database**: PostgreSQL (via pg), Redis (via ioredis)
- **Queue**: BullMQ
- **Validation**: Zod

### Frontend (dashboard-ui)
- **Framework**: React 19
- **Build**: Vite 7
- **Styling**: TailwindCSS 4
- **Language**: TypeScript

## Commands

### Backend (thesis-validator/)
```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript
npm run start        # Run production build
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run typecheck    # Type-check without emitting
npm run lint         # Run ESLint
npm run lint:fix     # Fix lint issues
npm run db:init      # Initialize database
npm run seed:skills  # Seed skill library
```

### Frontend (dashboard-ui/)
```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production (includes tsc)
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

## TypeScript Configuration

The project uses strict TypeScript settings:
- `noUncheckedIndexedAccess: true` - Always check for undefined on index access
- `exactOptionalPropertyTypes: true` - Optional properties must match exactly
- `noUnusedLocals/Parameters: true` - No dead code

### Path Aliases (thesis-validator)
```typescript
import { BaseAgent } from '@agents/base-agent.js';
import { DealMemory } from '@memory/deal-memory.js';
```

**Important**: Always use `.js` extension in imports (ESM requirement).

## Coding Conventions

### File Structure
- One class/major export per file
- Index files for re-exports
- JSDoc comments for public APIs

### Naming
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Agents Pattern
All agents extend `BaseAgent` and implement:
```typescript
abstract execute(input: unknown): Promise<AgentResult>;
```

Use `callLLM()` or `callLLMWithTools()` for LLM interactions.

### Schema Validation
Use Zod for all external data:
```typescript
const MySchema = z.object({...});
type MyType = z.infer<typeof MySchema>;
```

### Error Handling
- Return `AgentResult` with `success: false` for recoverable errors
- Throw only for unrecoverable errors
- Always update agent status on errors

## Environment Variables

Required for thesis-validator:
```bash
# LLM Provider (choose one)
ANTHROPIC_API_KEY=sk-...
# or
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=...
GOOGLE_CLOUD_LOCATION=...

# Other APIs
OPENAI_API_KEY=sk-...      # For embeddings
TAVILY_API_KEY=...         # For web search

# Server
API_HOST=0.0.0.0
API_PORT=3000
```

## Testing

Tests use Vitest and follow this pattern:
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

Run tests from thesis-validator directory:
```bash
npm test                    # Run once
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

## Dependencies

Before running, ensure infrastructure is running:
```bash
docker-compose up -d    # Starts Redis and vector DB
```

## Git Workflow

- Main branch: `main`
- Feature branches: `feature/description` or `claude/description`
- Commits should be atomic and descriptive
