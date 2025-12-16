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
│  (REST + WebSocket)                                         │
├─────────────────────────────────────────────────────────────┤
│                    Workflow Layer                            │
│  Research │ Stress Test │ Expert Call │ Closeout            │
├─────────────────────────────────────────────────────────────┤
│                     Agent Layer                              │
│  Conductor │ Hypothesis │ Evidence │ Contradiction │ Expert │
├─────────────────────────────────────────────────────────────┤
│                    Memory Layer                              │
│  Deal Memory │ Institutional Memory │ Market Intelligence   │
├─────────────────────────────────────────────────────────────┤
│                     Tools Layer                              │
│  Embedding │ Web Search │ Doc Parser │ Credibility │ Trans  │
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
│   ├── models/          # Data models and schemas
│   ├── memory/          # Vector memory layer
│   ├── tools/           # External integrations
│   ├── agents/          # AI agents
│   ├── workflows/       # Business workflows
│   ├── api/             # REST & WebSocket API
│   └── config/          # Configuration
├── scripts/             # Utility scripts
├── tests/               # Test suites
└── docker-compose.yml   # Infrastructure
```

### Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run db:init      # Initialize database
npm run seed:skills  # Seed skill library
npm run benchmark    # Run benchmarks
```

## License

Proprietary - All rights reserved.
