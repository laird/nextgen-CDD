# Thesis Validator

Agentic Commercial and Technical Diligence Research System for Private Equity Investment Analysis.

## Overview

Thesis Validator is a multi-agent AI system designed to validate, pressure-test, and continuously learn from private equity investment theses. It combines:

- **Multi-Agent Architecture**: Specialized agents for hypothesis building, evidence gathering, contradiction hunting, expert synthesis, and comparables analysis
- **Vector Memory System**: Three-tier memory with deal-specific, institutional, and market intelligence layers
- **Reflexion Pattern**: Continuous learning from past engagements for improved methodologies
- **Real-Time Support**: WebSocket-based expert call assistance with live transcript processing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  (Fastify REST + WebSocket + JWT Auth)                      │
├─────────────────────────────────────────────────────────────┤
│                  Background Workers (BullMQ)                 │
│  Research Worker (10min lock)  │  Document Processor (2x)   │
├─────────────────────────────────────────────────────────────┤
│                    Workflow Layer                            │
│  Research │ Stress Test │ Expert Call │ Closeout            │
├─────────────────────────────────────────────────────────────┤
│                     Agent Layer                              │
│  Conductor │ Hypothesis │ Evidence │ Contradiction │ Expert │
│  ComparablesFinder │ ExpertSynthesizer                       │
├─────────────────────────────────────────────────────────────┤
│                   Repository Layer                           │
│  Engagement │ Hypothesis │ Evidence │ Contradiction │ Docs  │
│  ResearchJob │ Metrics │ StressTest                          │
├─────────────────────────────────────────────────────────────┤
│                    Memory Layer (Vector)                     │
│  Deal Memory │ Institutional Memory │ Market Intelligence   │
│  Reflexion Store │ Skill Library                             │
├─────────────────────────────────────────────────────────────┤
│                     Tools Layer                              │
│  Embedding │ Web Search │ Doc Parser │ Credibility │ Trans  │
├─────────────────────────────────────────────────────────────┤
│                    Infrastructure                            │
│  PostgreSQL 16 │ Redis 7 + BullMQ │ Ruvector (Vector DB)    │
│  Claude (Anthropic/Vertex AI) │ OpenAI (Embeddings)          │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- LLM Provider (choose one):
  - Anthropic API Key, OR
  - Google Cloud Project with Vertex AI enabled, OR
  - Ollama running locally (free, no API key needed)
- OpenAI API Key (for embeddings)
- Tavily API Key (for web search)

### Installation

```bash
# Clone the repository
cd thesis-validator

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure (Ruvector, Redis)
docker-compose up -d

# Initialize database
npm run db:init

# Create database schema (first install only)
npm run db:schema

# Run migrations
npm run db:migrate

# Seed skill library
npm run seed:skills

# Start the server
npm run dev
```

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
npm start
```

## API Endpoints

### Engagements

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/engagements` | Create new engagement |
| GET | `/api/v1/engagements` | List engagements |
| GET | `/api/v1/engagements/:id` | Get engagement details |
| PATCH | `/api/v1/engagements/:id` | Update engagement |
| POST | `/api/v1/engagements/:id/thesis` | Submit investment thesis |

### Research

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/research/:id/research` | Start research workflow |
| GET | `/api/v1/research/:id/hypothesis-tree` | Get hypothesis tree |
| POST | `/api/v1/research/:id/stress-test` | Run stress test |
| GET | `/api/v1/research/:id/report` | Generate report |

### Evidence

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/:id/evidence` | List evidence |
| POST | `/api/v1/:id/evidence` | Add evidence |
| GET | `/api/v1/:id/contradictions` | List contradictions |
| POST | `/api/v1/:id/documents` | Upload document |

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/skills` | List skills |
| POST | `/api/v1/skills` | Create skill |
| POST | `/api/v1/skills/:id/execute` | Execute skill |
| GET | `/api/v1/skills/comparables` | Search comparables |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host/engagements/:id/events` | Real-time events |
| `ws://host/engagements/:id/expert-call` | Expert call assistance |

## Agent Architecture

### Conductor Agent
Orchestrates workflow execution, task decomposition, and agent coordination.

### Hypothesis Builder Agent
Decomposes investment theses into testable, atomic hypotheses with causal relationships.

### Evidence Gatherer Agent
Systematically collects evidence from web sources, documents, and databases.

### Contradiction Hunter Agent
Actively seeks disconfirming evidence and alternative interpretations.

### Expert Synthesizer Agent
Processes expert call transcripts to extract insights and validate hypotheses.

### Comparables Finder Agent
Identifies analogous deals and applicable frameworks from institutional memory.

## Memory System

### Deal Memory
Per-engagement isolated storage for:
- Hypothesis trees
- Evidence nodes
- Transcripts
- Documents

### Institutional Memory
Cross-deal knowledge including:
- Thesis patterns (success/failure)
- Sector knowledge
- Methodology templates
- Reflexion episodes

### Market Intelligence
Real-time market signals with temporal decay:
- News and trends
- Regulatory changes
- Competitive dynamics
- Macro indicators

## Configuration

### LLM Provider Configuration

The system supports multiple LLM providers through the Vercel AI SDK. Configure your preferred provider using environment variables:

#### Option 1: Anthropic (Direct API)

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Optional, this is the default
```

#### Option 2: Google Vertex AI

```bash
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_REGION=us-central1  # Optional, defaults to us-central1
VERTEX_AI_MODEL=claude-sonnet-4-20250514  # Optional
```

For Vertex AI authentication, use one of:
- **Service Account**: Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`
- **Workload Identity**: Automatic on GKE
- **Default Service Account**: Automatic on Cloud Run/GCE
- **User Credentials**: Run `gcloud auth application-default login`

#### Option 3: Ollama (Local LLM)

```bash
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2  # Or any model you have installed
OLLAMA_BASE_URL=http://localhost:11434  # Optional, this is the default
```

To use Ollama:
1. Install Ollama from https://ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama: `ollama serve`

#### Model Override

You can override the model for any provider using `LLM_MODEL`:

```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-20250514  # Override the default model
```

### Other Environment Variables

```bash
# Embeddings (required)
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-large

# Web Search
TAVILY_API_KEY=tvly-...

# Server
API_HOST=0.0.0.0
API_PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/thesis_validator
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key-at-least-32-characters
DISABLE_AUTH=true  # For development only
```

## Development

### Project Structure

```
thesis-validator/
├── src/
│   ├── agents/          # AI agents (conductor, hypothesis-builder, etc.)
│   ├── api/             # Fastify REST & WebSocket API
│   │   └── routes/      # Route handlers for each resource
│   ├── config/          # Environment configuration
│   ├── memory/          # Vector memory (deal, institutional, market)
│   ├── models/          # Zod schemas and data models
│   ├── repositories/    # PostgreSQL data access layer
│   ├── services/        # LLM provider abstraction, auth, job queue
│   ├── tools/           # External integrations (web search, embedding)
│   ├── workers/         # BullMQ background workers
│   │   ├── research-worker.ts        # Long-running research jobs
│   │   └── document-processor.worker.ts  # Document parsing
│   └── workflows/       # Business workflows (research, stress-test)
├── migrations/          # Database migration scripts
├── scripts/             # Utility scripts
├── tests/               # Vitest test suites
├── docs/                # Technical documentation
└── docker-compose.yml   # Local infrastructure
```

### Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run worker       # Start BullMQ worker for background jobs
npm run build        # Build for production
npm run start        # Run production build

# Testing
npm test             # Run tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage

# Database
npm run db:init      # Initialize vector database schema
npm run db:schema    # Create PostgreSQL tables (first install only)
npm run db:migrate   # Run pending migrations
npm run seed:skills  # Seed skill library

# Quality
npm run typecheck    # TypeScript type checking
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix lint issues
npm run benchmark    # Run performance benchmarks
```

## Background Workers

The system uses BullMQ for processing long-running tasks asynchronously.

### Research Worker

Processes research workflows that can take several minutes:

```bash
# Start the worker (separate terminal)
npm run worker
```

**Configuration:**
- Queue name: `research-jobs`
- Lock duration: 10 minutes (prevents job reassignment during processing)
- Lock renewal: Every 5 minutes
- Rate limiting: Max 10 jobs per minute
- Progress updates: Real-time via Redis pub/sub

### Document Processor Worker

Processes uploaded documents (PDF, DOCX, etc.):

- Queue name: `document-processing`
- Concurrency: 2 workers
- Extracts text, creates chunks, generates embeddings
- Updates document status in PostgreSQL

## License

Proprietary - All rights reserved.
